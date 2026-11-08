import axios from 'axios'
import { EventEmitter } from 'events'

export interface WhaleTrade {
  key: string
  wallet: string
  side: string
  tokenId: string
  conditionId: string
  title: string
  outcome: string
  price: number
  size: number
  /** Epoch seconds of the fill. */
  timestamp: number
  transactionHash: string
}

const MAX_SEEN = 5000

export function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value)
}

export class PolymarketListener extends EventEmitter {
  private isRunning = false
  private seen = new Set<string>()
  private baselineTaken = false

  constructor(
    private dataUrl: string,
    private targetWhale: string,
    private pollInterval = 5000,
  ) {
    super()
  }

  start(): void {
    if (!isWalletAddress(this.targetWhale)) {
      console.warn('TARGET_WHALE_ADDRESS is not a valid wallet address, so whale monitoring is off')
      return
    }
    this.isRunning = true
    console.log(`Watching Polymarket trades for ${this.targetWhale}`)
    void this.poll()
  }

  stop(): void {
    this.isRunning = false
  }

  private async poll(): Promise<void> {
    while (this.isRunning) {
      try {
        this.ingest(await this.fetchTrades())
      } catch (error) {
        this.emit('error', error instanceof Error ? new Error(error.message) : new Error('Polling failed'))
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval))
    }
  }

  private ingest(trades: WhaleTrade[]): void {
    const fresh = trades.filter((trade) => !this.seen.has(trade.key))
    fresh.forEach((trade) => this.seen.add(trade.key))

    // Trades that existed before startup are history, not signals.
    if (this.baselineTaken) {
      fresh.sort((a, b) => a.timestamp - b.timestamp).forEach((trade) => this.emit('trade', trade))
    }
    this.baselineTaken = true

    if (this.seen.size > MAX_SEEN) {
      this.seen = new Set([...this.seen].slice(-MAX_SEEN))
    }
  }

  private async fetchTrades(): Promise<WhaleTrade[]> {
    const response = await axios.get(`${this.dataUrl}/v2/trades`, {
      params: { user: this.targetWhale, limit: 50 },
      timeout: 5000,
    })
    return (response.data?.data ?? []).map((row: any): WhaleTrade => ({
      key: `${row.transaction_hash}:${row.token_id}:${row.side}:${row.size}:${row.price}`,
      wallet: row.proxy_wallet,
      side: row.side,
      tokenId: row.token_id,
      conditionId: row.condition_id,
      title: row.title,
      outcome: row.outcome,
      price: Number(row.price),
      size: Number(row.size),
      timestamp: Number(row.timestamp),
      transactionHash: row.transaction_hash,
    }))
  }
}
