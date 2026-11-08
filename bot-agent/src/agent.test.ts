import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionTokens } from './auth.js'
import { ExecutionService } from './services/executionService.js'
import type { PlaceOrder } from './services/executionService.js'
import { FirecrawlService } from './services/firecrawlService.js'
import type { WebContext, WebSource } from './services/firecrawlService.js'
import type { WhaleTrade } from './services/polymarketListener.js'
import { validateTrade } from './services/validation.js'
import type { SourceStance } from './services/validation.js'

const NOW = 1_800_000_000
const rules = { maxTradeAgeSeconds: 120, maxSlippage: 0.02, minCorroboratingDomains: 2 }
const trade: WhaleTrade = {
  key: 'k', wallet: '0xa', side: 'BUY', tokenId: '1', conditionId: '0xc', title: 'Will X?', outcome: 'Yes',
  price: 0.5, size: 1000, timestamp: NOW - 10, transactionHash: '0xh',
}
const source = (id: number, url: string, kind: WebSource['kind'] = 'market'): WebSource => ({ id, kind, url, title: 't', excerpt: 'e' })
const context = (sources: WebSource[]): WebContext => ({ available: sources.length > 0, fetchedAt: '', sources })
const two = context([source(0, 'https://a.com/1'), source(1, 'https://www.b.org/2')])
const support: SourceStance[] = [{ id: 0, stance: 'supports' }, { id: 1, stance: 'supports' }]
const book = { bestBid: 0.49, bestAsk: 0.51, askDepthUsdc: 1000 }
const run = (t: WhaleTrade, c: WebContext, s: SourceStance[], b: typeof book | null = book) => validateTrade(t, c, s, b, rules, NOW)
const failed = (result: ReturnType<typeof run>) => result.checks.filter((check) => !check.passed).map((check) => check.name)

describe('validateTrade', () => {
  it('approves a fresh buy backed by two sites', () => {
    expect(run(trade, two, support).approved).toBe(true)
  })
  it('blocks when web context is unavailable', () => {
    const r = run(trade, { available: false, error: 'x', fetchedAt: '', sources: [] }, support)
    expect(r.approved).toBe(false)
    expect(failed(r)).toContain('web_context')
  })
  it('counts two articles from one site once', () => {
    const c = context([source(0, 'https://a.com/1'), source(1, 'https://news.a.com/2')])
    expect(failed(run(trade, c, support))).toContain('corroborated')
  })
  it('ignores macro articles as corroboration', () => {
    const c = context([source(0, 'https://a.com/1', 'macro'), source(1, 'https://b.org/2', 'macro')])
    expect(failed(run(trade, c, support))).toContain('corroborated')
  })
  it('ignores article ids the model invented', () => {
    expect(failed(run(trade, two, [{ id: 7, stance: 'supports' }, { id: 8, stance: 'supports' }]))).toContain('corroborated')
  })
  it('blocks when contradiction ties support', () => {
    const c = context([source(0, 'https://a.com'), source(1, 'https://b.org'), source(2, 'https://c.net'), source(3, 'https://d.io')])
    const s: SourceStance[] = [{ id: 0, stance: 'supports' }, { id: 1, stance: 'supports' }, { id: 2, stance: 'contradicts' }, { id: 3, stance: 'contradicts' }]
    expect(failed(run(trade, c, s))).toContain('not_contradicted')
  })
  it('blocks stale trades, sells, price moves and an empty book', () => {
    expect(failed(run({ ...trade, timestamp: NOW - 500 }, two, support))).toContain('trade_fresh')
    expect(failed(run({ ...trade, side: 'SELL' }, two, support))).toContain('copyable_side')
    expect(failed(run(trade, two, support, { ...book, bestAsk: 0.6 }))).toContain('price_in_range')
    expect(failed(run(trade, two, support, null))).toContain('price_in_range')
  })
})

describe('SessionTokens', () => {
  const secret = 's'.repeat(32)
  it('verifies its own token and rejects tampering', () => {
    const tokens = new SessionTokens(secret, 60, 2)
    const { token } = tokens.issue('0xa', ['analyze'])
    expect(tokens.verify(token)?.scopes).toEqual(['analyze'])
    const [, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ jti: 'x', sub: '0xa', scopes: ['trade:execute'], exp: 9999999999 })).toString('base64url')
    expect(tokens.verify(`${forged}.${signature}`)).toBeNull()
  })
  it('rejects expired tokens and tokens from another secret', () => {
    const tokens = new SessionTokens(secret, 60, 2)
    expect(tokens.verify(tokens.issue('a', ['analyze'], -1).token)).toBeNull()
    expect(new SessionTokens('t'.repeat(32), 60, 2).verify(tokens.issue('a', ['analyze']).token)).toBeNull()
  })
  it('caps analyses per session', () => {
    const tokens = new SessionTokens(secret, 60, 1)
    const claims = tokens.verify(tokens.issue('a', ['analyze']).token)!
    expect(tokens.consumeAnalysis(claims)).toBe(true)
    expect(tokens.consumeAnalysis(claims)).toBe(false)
  })
  it('refuses a short secret', () => {
    expect(() => new SessionTokens('short', 60, 1)).toThrow()
  })
})

describe('ExecutionService', () => {
  const setup = (live: boolean, placeOrder: PlaceOrder) =>
    new ExecutionService(
      { live, copyRatio: 0.01, minOrderUsdc: 1, maxOrderUsdc: 5, maxDailyUsdc: 8, stateFile: join(mkdtempSync(join(tmpdir(), 'agent-')), 'state.json') },
      placeOrder,
    )
  const request = (key: string, whaleNotionalUsdc = 1000) => ({ key, tokenId: '1', whaleNotionalUsdc, maxPrice: 0.52 })
  const ok: PlaceOrder = async () => ({ orderId: 'o1' })

  it('never calls the order placer in a dry run', async () => {
    const place = vi.fn(ok)
    const result = await setup(false, place).execute(request('a'))
    expect(result.status).toBe('dry_run')
    expect(place).not.toHaveBeenCalled()
  })
  it('copies a trade only once', async () => {
    const place = vi.fn(ok)
    const service = setup(true, place)
    expect((await service.execute(request('a'))).status).toBe('placed')
    expect((await service.execute(request('a'))).status).toBe('duplicate')
    expect(place).toHaveBeenCalledTimes(1)
  })
  it('caps order size and stops at the daily limit, even when called at once', async () => {
    const place = vi.fn(ok)
    const service = setup(true, place)
    const results = await Promise.all(['a', 'b', 'c'].map((key) => service.execute(request(key, 100000))))
    expect(results.map((r) => r.status)).toEqual(['placed', 'skipped', 'skipped'])
    expect(place).toHaveBeenCalledWith({ tokenId: '1', amountUsdc: 5, maxPrice: 0.52 })
  })
  it('keeps a failed order counted, because it may have filled', async () => {
    const service = setup(true, async () => {
      throw new Error('timeout')
    })
    expect((await service.execute(request('a'))).status).toBe('failed')
    expect((await service.execute(request('a'))).status).toBe('duplicate')
  })
  it('skips copies below the minimum', async () => {
    expect((await setup(true, ok).execute(request('a', 10))).status).toBe('skipped')
  })
})

describe('FirecrawlService', () => {
  const original = process.env.FIRECRAWL_API_KEY
  afterEach(() => {
    process.env.FIRECRAWL_API_KEY = original
  })

  const serve = (status: number, body: unknown) =>
    new Promise<{ url: string; auth: () => string | undefined; close: () => void }>((resolve) => {
      let auth: string | undefined
      const server = createServer((req, res) => {
        auth = req.headers.authorization
        req.resume()
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      }).listen(0, '127.0.0.1', () => {
        resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, auth: () => auth, close: () => server.close() })
      })
    })

  it('sends the key as a header and tags market and macro articles', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-secret'
    const stub = await serve(200, { data: { news: [{ title: 'A', url: 'https://a.com', snippet: 'text' }, { title: 'bad', url: 'javascript:alert(1)' }] } })
    const result = await new FirecrawlService(stub.url).getContext('Will X?')
    stub.close()
    expect(stub.auth()).toBe('Bearer fc-secret')
    expect(result.available).toBe(true)
    expect(result.sources.map((s) => s.kind)).toEqual(['market', 'macro'])
    expect(result.sources.map((s) => s.id)).toEqual([0, 1])
  })
  it('reports failure without exposing the key', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-secret'
    const stub = await serve(401, { error: 'nope' })
    const result = await new FirecrawlService(stub.url).getContext('Will X?')
    stub.close()
    expect(result.available).toBe(false)
    expect(JSON.stringify(result)).not.toContain('fc-secret')
  })
  it('is unavailable with no key set', async () => {
    delete process.env.FIRECRAWL_API_KEY
    const result = await new FirecrawlService('http://127.0.0.1:1').getContext('Will X?')
    expect(result).toMatchObject({ available: false, error: 'FIRECRAWL_API_KEY is not set' })
  })
})
