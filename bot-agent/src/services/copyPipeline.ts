import type { AppConfig } from '../config.js'
import type { AgentService, TradeSignal } from './agentService.js'
import type { ExecutionResult, ExecutionService } from './executionService.js'
import type { FirecrawlService, WebContext } from './firecrawlService.js'
import { fetchBook } from './marketData.js'
import type { BookSnapshot } from './marketData.js'
import type { WhaleTrade } from './polymarketListener.js'
import { validateTrade } from './validation.js'
import type { SourceStance } from './validation.js'

interface SignalRecord {
  trade: WhaleTrade
  signal: TradeSignal
  context: WebContext
  stances: SourceStance[]
}

const MAX_RECORDS = 500

export class CopyPipeline {
  private queue: Promise<void> = Promise.resolve()
  private records = new Map<string, SignalRecord>()

  constructor(
    private config: AppConfig,
    private agent: AgentService,
    private firecrawl: FirecrawlService,
    private execution: ExecutionService,
    private broadcast: (signal: TradeSignal) => void,
  ) {}

  /** Never rejects, so one bad trade or LLM outage can't take the agent down. */
  enqueue(trade: WhaleTrade): void {
    this.queue = this.queue
      .then(() => this.process(trade))
      .catch((error) => console.error(`Trade ${trade.transactionHash} failed: ${(error as Error).message}`))
  }

  private loadBook(tokenId: string): Promise<BookSnapshot | null> {
    return fetchBook(this.config.polymarketClobUrl, tokenId).catch(() => null)
  }

  private async process(trade: WhaleTrade): Promise<void> {
    // Cheap filters first, since everything after this spends LLM and Firecrawl credits.
    const notional = trade.size * trade.price
    const age = Date.now() / 1000 - trade.timestamp
    if (notional < this.config.minWhaleNotionalUsdc || age > this.config.validation.maxTradeAgeSeconds) {
      console.log(`Ignored trade ${trade.transactionHash}: $${notional.toFixed(2)}, ${Math.round(age)}s old`)
      return
    }

    const [context, book] = await Promise.all([this.firecrawl.getContext(trade.title), this.loadBook(trade.tokenId)])

    const { signal, stances } = await this.agent.analyzeTradeSignal({
      transaction: { side: trade.side, price: trade.price, size: trade.size, hash: trade.transactionHash },
      market: trade.title,
      outcome: trade.outcome,
      whaleAddress: trade.wallet,
      timestamp: new Date(trade.timestamp * 1000).toISOString(),
      webContext: context,
      book,
    })

    const stanceById = new Map(stances.map((item) => [item.id, item.stance]))
    signal.sources = context.sources.map((source) => ({
      title: source.title,
      url: source.url,
      kind: source.kind,
      stance: stanceById.get(source.id) ?? 'neutral',
    }))
    signal.validation = validateTrade(trade, context, stances, book, this.config.validation)

    this.remember({ trade, signal, context, stances })

    if (signal.recommendation === 'EXECUTE' && signal.validation.approved) {
      signal.execution = await this.place(trade)
    } else {
      if (signal.recommendation === 'EXECUTE') signal.recommendation = 'REVIEW'
      signal.execution = { status: 'not_attempted', detail: this.blockedReason(signal) }
    }

    this.broadcast(signal)
  }

  private place(trade: WhaleTrade): Promise<ExecutionResult> {
    return this.execution.execute({
      key: trade.key,
      tokenId: trade.tokenId,
      whaleNotionalUsdc: trade.size * trade.price,
      maxPrice: Math.min(trade.price + this.config.validation.maxSlippage, 0.99),
    })
  }

  private blockedReason(signal: TradeSignal): string {
    const failed = signal.validation?.checks.find((check) => !check.passed)
    return failed ? failed.detail : 'Agent did not recommend executing'
  }

  /** Token-gated manual copy. Re-checks freshness and price against the book as it is now. */
  async executeSignal(signalId: string): Promise<{ httpStatus: number; signal?: TradeSignal; error?: string }> {
    const record = this.records.get(signalId)
    if (!record) return { httpStatus: 404, error: 'Unknown signal' }
    if (record.signal.recommendation === 'SKIP') return { httpStatus: 409, error: 'Signal exceeded the risk limit' }

    const book = await this.loadBook(record.trade.tokenId)
    const validation = validateTrade(record.trade, record.context, record.stances, book, this.config.validation)
    record.signal.validation = validation

    if (!validation.approved) {
      record.signal.execution = { status: 'not_attempted', detail: this.blockedReason(record.signal) }
      this.broadcast(record.signal)
      return { httpStatus: 409, signal: record.signal, error: 'Validation failed' }
    }

    const result = await this.place(record.trade)
    // A repeat must not erase the record of the approval that already happened.
    if (result.status !== 'duplicate' || !record.signal.execution?.solanaTx) record.signal.execution = result
    this.broadcast(record.signal)
    return { httpStatus: 200, signal: record.signal }
  }

  private remember(record: SignalRecord): void {
    this.records.set(record.signal.id, record)
    if (this.records.size > MAX_RECORDS) {
      this.records.delete(this.records.keys().next().value as string)
    }
  }
}
