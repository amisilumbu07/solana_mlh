function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number`)
  return value
}

function list(name: string, fallback: string[] = []): string[] {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
}

export function loadConfig() {
  return {
    port: num('PORT', 3001),
    targetWhale: process.env.TARGET_WHALE_ADDRESS ?? '',
    polymarketDataUrl: process.env.POLYMARKET_DATA_URL || 'https://data-api.polymarket.com',
    polymarketClobUrl: process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com',
    firecrawlUrl: process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev',
    dashboardOrigins: list('DASHBOARD_ORIGINS', ['http://localhost:3000', 'http://127.0.0.1:3000']),

    risk: {
      maxRiskScore: num('MAX_RISK_SCORE', 0.7),
      minConfidence: num('MIN_CONFIDENCE', 0.65),
      autoExecute: process.env.AUTO_EXECUTE === 'true',
    },

    validation: {
      maxTradeAgeSeconds: num('MAX_TRADE_AGE_SECONDS', 120),
      maxSlippage: num('MAX_SLIPPAGE', 0.02),
      minCorroboratingDomains: num('MIN_CORROBORATING_DOMAINS', 2),
    },

    minWhaleNotionalUsdc: num('MIN_WHALE_NOTIONAL_USDC', 100),

    execution: {
      // Anything other than the exact word "live" stays a dry run.
      live: process.env.EXECUTION_MODE === 'live',
      copyRatio: num('COPY_RATIO', 0.01),
      minOrderUsdc: num('MIN_ORDER_USDC', 1),
      maxOrderUsdc: num('MAX_ORDER_USDC', 5),
      maxDailyUsdc: num('MAX_DAILY_USDC', 25),
      stateFile: process.env.EXECUTION_STATE_FILE || '.agent-state.json',
    },

    x402: {
      payTo: process.env.X402_PAY_TO ?? '',
      price: process.env.X402_SESSION_PRICE || '$0.05',
      network: process.env.X402_NETWORK || 'eip155:84532',
      facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
      executeAllowlist: list('X402_EXECUTE_ALLOWLIST').map((address) => address.toLowerCase()),
    },

    session: {
      secret: process.env.AGENT_SESSION_SECRET ?? '',
      ttlSeconds: num('SESSION_TTL_SECONDS', 3600),
      maxAnalyses: num('SESSION_MAX_ANALYSES', 20),
    },
  }
}

export type AppConfig = ReturnType<typeof loadConfig>
