import axios from 'axios'

export interface WebSource {
  id: number
  kind: 'market' | 'macro'
  title: string
  url: string
  date?: string
  excerpt: string
}

export interface WebContext {
  available: boolean
  error?: string
  fetchedAt: string
  sources: WebSource[]
}

type Article = Omit<WebSource, 'id' | 'kind'>

const MARKET_CACHE_MS = 5 * 60 * 1000
const MACRO_CACHE_MS = 15 * 60 * 1000
const EXCERPT_CHARS = 1200
const MACRO_QUERY = 'Federal Reserve interest rates inflation economy markets news today'

export class FirecrawlService {
  private cache = new Map<string, { expires: number; articles: Article[] }>()

  constructor(private baseUrl: string) {}

  async getContext(marketTitle: string): Promise<WebContext> {
    const fetchedAt = new Date().toISOString()
    try {
      const [market, macro] = await Promise.all([
        this.search(marketTitle.slice(0, 500), 5, MARKET_CACHE_MS, true),
        this.search(MACRO_QUERY, 3, MACRO_CACHE_MS, false),
      ])
      const sources: WebSource[] = [
        ...market.map((a) => ({ ...a, kind: 'market' as const })),
        ...macro.map((a) => ({ ...a, kind: 'macro' as const })),
      ].map((source, id) => ({ ...source, id }))
      return { available: sources.length > 0, fetchedAt, sources }
    } catch (error) {
      return { available: false, error: (error as Error).message, fetchedAt, sources: [] }
    }
  }

  private async search(query: string, limit: number, ttl: number, withPageText: boolean): Promise<Article[]> {
    const cached = this.cache.get(query)
    if (cached && cached.expires > Date.now()) return cached.articles

    // Read per call so the key lives only in the server environment.
    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) throw new Error('FIRECRAWL_API_KEY is not set')

    let body: any
    try {
      const response = await axios.post(
        `${this.baseUrl}/v2/search`,
        {
          query,
          limit,
          sources: ['news'],
          tbs: 'sbd:1,qdr:w',
          timeout: 30000,
          ...(withPageText ? { scrapeOptions: { formats: [{ type: 'markdown' }], onlyMainContent: true } } : {}),
        },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 40000 },
      )
      body = response.data
    } catch (error) {
      // AxiosError carries the request headers, so it must never be logged or rethrown as is.
      const status = axios.isAxiosError(error) ? error.response?.status : undefined
      throw new Error(status ? `Firecrawl returned HTTP ${status}` : 'Firecrawl request failed')
    }

    const articles: Article[] = (body?.data?.news ?? [])
      .filter((item: any) => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url))
      .map((item: any) => ({
        title: String(item.title ?? '').slice(0, 300),
        url: item.url,
        date: typeof item.date === 'string' ? item.date : undefined,
        excerpt: String(item.markdown || item.snippet || '').slice(0, EXCERPT_CHARS),
      }))

    this.cache.set(query, { expires: Date.now() + ttl, articles })
    return articles
  }
}
