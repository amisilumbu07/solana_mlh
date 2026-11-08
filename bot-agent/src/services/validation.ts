import type { WebContext, WebSource } from './firecrawlService.js'
import type { BookSnapshot } from './marketData.js'
import type { WhaleTrade } from './polymarketListener.js'

export type Stance = 'supports' | 'contradicts' | 'neutral'

export interface SourceStance {
  id: number
  stance: Stance
}

export interface ValidationCheck {
  name: string
  passed: boolean
  detail: string
}

export interface ValidationResult {
  approved: boolean
  checks: ValidationCheck[]
  supportingDomains: string[]
  contradictingDomains: string[]
}

export interface ValidationRules {
  maxTradeAgeSeconds: number
  maxSlippage: number
  minCorroboratingDomains: number
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().split('.').slice(-2).join('.')
  } catch {
    return ''
  }
}

function domainsWith(stance: Stance, stances: SourceStance[], sources: Map<number, WebSource>): string[] {
  const domains = new Set<string>()
  for (const item of stances) {
    const source = sources.get(item.id)
    // Only articles about this market count. General macro news can't corroborate a specific bet,
    // and ids the model invented match nothing here.
    if (item.stance === stance && source?.kind === 'market') {
      const domain = domainOf(source.url)
      if (domain) domains.add(domain)
    }
  }
  return [...domains]
}

/**
 * Deterministic gate between the model's opinion and an order. The model only labels each
 * article, so text on a scraped page can't approve a trade on its own.
 */
export function validateTrade(
  trade: WhaleTrade,
  context: WebContext,
  stances: SourceStance[],
  book: BookSnapshot | null,
  rules: ValidationRules,
  nowSeconds = Date.now() / 1000,
): ValidationResult {
  const sources = new Map(context.sources.map((source) => [source.id, source]))
  const supporting = domainsWith('supports', stances, sources)
  const contradicting = domainsWith('contradicts', stances, sources)
  const age = nowSeconds - trade.timestamp
  const priceLimit = trade.price + rules.maxSlippage

  const checks: ValidationCheck[] = [
    {
      name: 'copyable_side',
      passed: trade.side === 'BUY',
      detail: trade.side === 'BUY' ? 'Whale bought' : 'Sells are not copied because positions are not tracked',
    },
    {
      name: 'trade_fresh',
      passed: age >= 0 && age <= rules.maxTradeAgeSeconds,
      detail: `Trade is ${Math.round(age)}s old, limit ${rules.maxTradeAgeSeconds}s`,
    },
    {
      name: 'web_context',
      passed: context.available,
      detail: context.available ? `${context.sources.length} articles read` : context.error ?? 'No articles found',
    },
    {
      name: 'corroborated',
      passed: supporting.length >= rules.minCorroboratingDomains,
      detail: `${supporting.length} of ${rules.minCorroboratingDomains} required sites support this outcome`,
    },
    {
      name: 'not_contradicted',
      passed: supporting.length > contradicting.length,
      detail: `${supporting.length} sites support, ${contradicting.length} contradict`,
    },
    {
      name: 'price_in_range',
      passed: book?.bestAsk != null && book.bestAsk <= priceLimit,
      detail:
        book?.bestAsk == null
          ? 'No live asks in the order book'
          : `Best ask ${book.bestAsk}, whale paid ${trade.price}, limit ${priceLimit.toFixed(4)}`,
    },
  ]

  return {
    approved: checks.every((check) => check.passed),
    checks,
    supportingDomains: supporting,
    contradictingDomains: contradicting,
  }
}
