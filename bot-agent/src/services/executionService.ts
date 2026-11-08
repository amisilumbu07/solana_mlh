import { readFileSync, renameSync, writeFileSync } from 'fs'
import type { AppConfig } from '../config.js'

export interface OrderRequest {
  key: string
  tokenId: string
  whaleNotionalUsdc: number
  /** Most we'll pay per share. */
  maxPrice: number
}

export interface PlacedOrder {
  orderId: string
  status?: string
}

export type PlaceOrder = (order: { tokenId: string; amountUsdc: number; maxPrice: number }) => Promise<PlacedOrder>

export interface ExecutionResult {
  status: 'dry_run' | 'placed' | 'failed' | 'duplicate' | 'skipped' | 'not_attempted'
  detail: string
  amountUsdc?: number
  maxPrice?: number
  orderId?: string
}

interface State {
  day: string
  spentUsdc: number
  executed: string[]
}

type ExecutionConfig = AppConfig['execution']

const MAX_REMEMBERED = 5000

export class ExecutionService {
  private queue: Promise<unknown> = Promise.resolve()
  private state: State

  constructor(
    private config: ExecutionConfig,
    private placeOrder: PlaceOrder,
  ) {
    this.state = this.load()
  }

  /** Runs one at a time so concurrent calls can't both slip under the daily cap. */
  execute(request: OrderRequest): Promise<ExecutionResult> {
    const result = this.queue.then(() => this.run(request))
    this.queue = result.catch(() => undefined)
    return result
  }

  private async run(request: OrderRequest): Promise<ExecutionResult> {
    if (this.state.executed.includes(request.key)) {
      return { status: 'duplicate', detail: 'This whale trade was already copied' }
    }

    const amountUsdc = Math.floor(Math.min(this.config.maxOrderUsdc, request.whaleNotionalUsdc * this.config.copyRatio) * 100) / 100
    if (amountUsdc < this.config.minOrderUsdc) {
      return { status: 'skipped', detail: `Copy size $${amountUsdc} is below the $${this.config.minOrderUsdc} minimum` }
    }

    if (!this.config.live) {
      return { status: 'dry_run', detail: 'Dry run, no order sent', amountUsdc, maxPrice: request.maxPrice }
    }

    this.rollDay()
    if (this.state.spentUsdc + amountUsdc > this.config.maxDailyUsdc) {
      return { status: 'skipped', detail: `Daily limit of $${this.config.maxDailyUsdc} reached`, amountUsdc }
    }

    // Saved before sending. A crash or timeout mid-order could mean it filled, so it stays counted.
    this.state.spentUsdc += amountUsdc
    this.state.executed = [...this.state.executed, request.key].slice(-MAX_REMEMBERED)
    this.save()

    try {
      const order = await this.placeOrder({ tokenId: request.tokenId, amountUsdc, maxPrice: request.maxPrice })
      return { status: 'placed', detail: order.status ?? 'Order accepted', amountUsdc, maxPrice: request.maxPrice, orderId: order.orderId }
    } catch (error) {
      return { status: 'failed', detail: (error as Error).message, amountUsdc, maxPrice: request.maxPrice }
    }
  }

  getSpentToday(): number {
    this.rollDay()
    return this.state.spentUsdc
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10)
  }

  private rollDay(): void {
    if (this.state.day !== this.today()) {
      this.state.day = this.today()
      this.state.spentUsdc = 0
    }
  }

  private load(): State {
    let raw: string
    try {
      raw = readFileSync(this.config.stateFile, 'utf8')
    } catch {
      return { day: this.today(), spentUsdc: 0, executed: [] }
    }
    // A corrupt file must stop the agent. Starting fresh would forget today's spending.
    return JSON.parse(raw) as State
  }

  private save(): void {
    const temp = `${this.config.stateFile}.tmp`
    writeFileSync(temp, JSON.stringify(this.state))
    renameSync(temp, this.config.stateFile)
  }
}

/** Real Polymarket order placement. Only loaded when EXECUTION_MODE=live. */
export async function createClobOrderPlacer(clobUrl: string): Promise<PlaceOrder> {
  const privateKey = process.env.POLYMARKET_PRIVATE_KEY
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('EXECUTION_MODE=live needs POLYMARKET_PRIVATE_KEY set to a 0x-prefixed 32-byte key')
  }

  const [{ ClobClient, Chain, OrderType, Side }, { createWalletClient, http }, { privateKeyToAccount }, { polygon }] = await Promise.all([
    import('@polymarket/clob-client'),
    import('viem'),
    import('viem/accounts'),
    import('viem/chains'),
  ])

  const signer = createWalletClient({
    account: privateKeyToAccount(privateKey as `0x${string}`),
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL || undefined),
  })
  const signatureType = Number(process.env.POLYMARKET_SIGNATURE_TYPE ?? 0)
  const funder = process.env.POLYMARKET_FUNDER || undefined
  const throwOnError = true

  const build = (creds?: Awaited<ReturnType<InstanceType<typeof ClobClient>['createOrDeriveApiKey']>>) =>
    new ClobClient(clobUrl, Chain.POLYGON, signer, creds, signatureType, funder, undefined, undefined, undefined, undefined, undefined, undefined, throwOnError)

  const client = build(await build().createOrDeriveApiKey())

  return async ({ tokenId, amountUsdc, maxPrice }) => {
    const tick = Number(await client.getTickSize(tokenId))
    const decimals = Math.max(0, Math.round(-Math.log10(tick)))
    const price = Number((Math.floor(maxPrice / tick + 1e-9) * tick).toFixed(decimals))
    if (price <= 0) throw new Error('Price limit rounds to zero at this market tick size')

    // Fill-or-kill, so a partly filled order can't sit on the book at a stale price.
    const response = await client.createAndPostMarketOrder(
      { tokenID: tokenId, amount: amountUsdc, side: Side.BUY, price },
      undefined,
      OrderType.FOK,
    )
    if (!response?.success || !response.orderID) {
      throw new Error(String(response?.errorMsg || 'Order was rejected'))
    }
    return { orderId: response.orderID, status: response.status }
  }
}
