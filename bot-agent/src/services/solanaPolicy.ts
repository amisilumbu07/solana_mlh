import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { clusterApiUrl, Connection, Keypair, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import type { Cluster } from '@solana/web3.js'
import type { AppConfig } from '../config.js'
import { PolicyRejection } from './executionService.js'
import type { AuthorizeCopy } from './executionService.js'

const TOTAL_RULES = 6
const ANCHOR_DISCRIMINATOR = 8
const AUTHORITY_BYTES = 32

const discriminator = (name: string) => createHash('sha256').update(`global:${name}`).digest().subarray(0, ANCHOR_DISCRIMINATOR)

function u64(value: number): Buffer {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64LE(BigInt(value))
  return buffer
}

function loadKeypair(path: string): Keypair {
  const resolved = path.startsWith('~/') ? `${homedir()}${path.slice(1)}` : path
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolved, 'utf8')) as number[]))
}

function transactionLogs(error: unknown): string {
  const logs = (error as { logs?: string[]; transactionLogs?: string[] }).logs ?? (error as { transactionLogs?: string[] }).transactionLogs
  return `${(logs ?? []).join('\n')}\n${(error as Error).message}`
}

export interface SolanaInfo {
  programId: string
  policy: string
  cluster: string
}

export interface SolanaPolicy {
  authorize: AuthorizeCopy
  info: SolanaInfo
}

/** Connects to the on-chain policy and creates or updates it to match the configured limits. */
export async function createSolanaPolicy(config: AppConfig['solana'], maxOrderCents: number, maxDailyCents: number): Promise<SolanaPolicy> {
  const authority = loadKeypair(config.keypairPath)
  const programId = new PublicKey(config.programId)
  const connection = new Connection(config.rpcUrl || clusterApiUrl(config.cluster as Cluster), 'confirmed')
  const [policy] = PublicKey.findProgramAddressSync([Buffer.from('policy'), authority.publicKey.toBuffer()], programId)

  const send = (keys: TransactionInstruction['keys'], data: Buffer) =>
    sendAndConfirmTransaction(connection, new Transaction().add(new TransactionInstruction({ programId, keys, data })), [authority])

  const signer = { pubkey: authority.publicKey, isSigner: true, isWritable: true }
  const policyKey = { pubkey: policy, isSigner: false, isWritable: true }
  const system = { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
  const limits = Buffer.concat([u64(maxOrderCents), u64(maxDailyCents)])

  const existing = await connection.getAccountInfo(policy)
  if (!existing) {
    await send([signer, policyKey, system], Buffer.concat([discriminator('initialize'), limits]))
  } else {
    const offset = ANCHOR_DISCRIMINATOR + AUTHORITY_BYTES
    if (!existing.data.subarray(offset, offset + limits.length).equals(limits)) {
      await send([{ ...signer, isWritable: false }, policyKey], Buffer.concat([discriminator('set_limits'), limits]))
    }
  }

  const authorize: AuthorizeCopy = async (tradeKey, amountCents) => {
    const tradeHash = createHash('sha256').update(tradeKey).digest()
    const [record] = PublicKey.findProgramAddressSync([Buffer.from('copy'), policy.toBuffer(), tradeHash], programId)
    if (await connection.getAccountInfo(record)) throw new PolicyRejection('This whale trade was already approved on Solana', true)
    const data = Buffer.concat([discriminator('authorize_copy'), tradeHash, u64(amountCents), Buffer.from([TOTAL_RULES])])
    try {
      const signature = await send([signer, policyKey, { pubkey: record, isSigner: false, isWritable: true }, system], data)
      return { signature }
    } catch (error) {
      const logs = transactionLogs(error)
      if (/already in use|already been processed/i.test(logs)) throw new PolicyRejection('This whale trade was already approved on Solana', true)
      const reason = logs.match(/Error Message: ([^.\n]+)/)?.[1]
      if (reason) throw new PolicyRejection(`Solana program refused: ${reason}`, false)
      throw new Error('Could not reach Solana for approval')
    }
  }

  return { authorize, info: { programId: programId.toBase58(), policy: policy.toBase58(), cluster: config.cluster } }
}
