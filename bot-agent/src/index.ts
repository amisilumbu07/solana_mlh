import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { createX402Gate, isLocalDashboard, requireScope, SessionTokens } from './auth.js'
import type { Scope, SessionClaims } from './auth.js'
import { loadConfig } from './config.js'
import { AgentService } from './services/agentService.js'
import type { TradeSignal } from './services/agentService.js'
import { CopyPipeline } from './services/copyPipeline.js'
import { createClobOrderPlacer, ExecutionService } from './services/executionService.js'
import type { PlaceOrder } from './services/executionService.js'
import { FirecrawlService } from './services/firecrawlService.js'
import { PolymarketListener } from './services/polymarketListener.js'

const config = loadConfig()

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })

app.use(
  cors({
    origin: config.dashboardOrigins,
    exposedHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE'],
  }),
)
app.use(express.json({ limit: '32kb' }))

const notConfigured: PlaceOrder = async () => {
  throw new Error('Live execution is not configured')
}
const placeOrder = config.execution.live ? await createClobOrderPlacer(config.polymarketClobUrl) : notConfigured

const agentService = new AgentService(config.risk)
const firecrawl = new FirecrawlService(config.firecrawlUrl)
const execution = new ExecutionService(config.execution, placeOrder)
const listener = new PolymarketListener(config.polymarketDataUrl, config.targetWhale)
const tokens = new SessionTokens(config.session.secret, config.session.ttlSeconds, config.session.maxAnalyses)
const x402 = createX402Gate(config.x402)

function broadcast(signal: TradeSignal) {
  const message = JSON.stringify(signal)
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message)
  })
}

const pipeline = new CopyPipeline(config, agentService, firecrawl, execution, broadcast)

wss.on('connection', (socket) => {
  socket.on('error', (error) => console.error(`WebSocket error: ${error.message}`))
})

const isScore = (value: unknown): value is number => typeof value === 'number' && value >= 0 && value <= 1

app.get('/health', (_req, res) => {
  res.json({ status: 'Agent middleware online', timestamp: new Date().toISOString() })
})

app.get('/api/wallets', (_req, res) => {
  res.json({ tracked: [config.targetWhale], status: 'monitoring' })
})

app.get('/api/config', (_req, res) => {
  res.json({
    riskConfig: agentService.getRiskConfig(),
    trackedWallets: [config.targetWhale],
    executionMode: config.execution.live ? 'live' : 'dry_run',
    webContextEnabled: Boolean(process.env.FIRECRAWL_API_KEY),
    limits: {
      maxOrderUsdc: config.execution.maxOrderUsdc,
      maxDailyUsdc: config.execution.maxDailyUsdc,
      spentTodayUsdc: execution.getSpentToday(),
    },
  })
})

app.get('/api/trade-history', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 1000)
  res.json(agentService.getTradeHistory(limit))
})

// Dashboard sessions can change risk settings only. They can never trade.
app.post('/api/session/dashboard', (req, res) => {
  if (!isLocalDashboard(req, config.dashboardOrigins)) {
    res.status(403).json({ error: 'Only the local dashboard can use this route' })
    return
  }
  res.json(tokens.issue('dashboard', ['config:write'], 900))
})

if (x402) {
  app.use(x402.middleware)
  app.post('/api/session', (req, res) => {
    const payer = x402.takePayer(req)?.toLowerCase()
    if (!payer) {
      // An error status also means the middleware won't settle the payment.
      res.status(502).json({ error: 'Could not confirm the payer' })
      return
    }
    // Paying proves payment, not identity, so trading needs an allowlisted wallet too.
    const scopes: Scope[] = config.x402.executeAllowlist.includes(payer) ? ['analyze', 'trade:execute'] : ['analyze']
    res.json(tokens.issue(payer, scopes))
  })
} else {
  app.post('/api/session', (_req, res) => {
    res.status(503).json({ error: 'x402 is not configured on this agent' })
  })
}

app.post('/api/risk-config', requireScope(tokens, 'config:write'), (req, res) => {
  const { maxRiskScore, minConfidence, autoExecute } = req.body ?? {}
  if (!isScore(maxRiskScore) || !isScore(minConfidence) || typeof autoExecute !== 'boolean') {
    res.status(400).json({ error: 'maxRiskScore and minConfidence must be 0-1 and autoExecute a boolean' })
    return
  }
  agentService.updateRiskConfig({ maxRiskScore, minConfidence, autoExecute })
  res.json({ success: true, config: agentService.getRiskConfig() })
})

// Analysis only. Orders can only come from the validated pipeline.
app.post('/api/analyze-trade', requireScope(tokens, 'analyze'), async (req, res) => {
  const { transaction, market, whaleAddress, outcome } = req.body ?? {}
  if (typeof market !== 'string' || !market.trim() || market.length > 500 || typeof whaleAddress !== 'string') {
    res.status(400).json({ error: 'market and whaleAddress are required strings' })
    return
  }
  if (!tokens.consumeAnalysis(res.locals.session as SessionClaims)) {
    res.status(429).json({ error: 'This session has used all of its analyses' })
    return
  }
  try {
    const webContext = await firecrawl.getContext(market)
    const { signal } = await agentService.analyzeTradeSignal({
      transaction,
      market,
      whaleAddress,
      outcome: typeof outcome === 'string' ? outcome : undefined,
      timestamp: new Date().toISOString(),
      webContext,
      book: null,
    })
    broadcast(signal)
    res.json(signal)
  } catch (error) {
    console.error(`Trade analysis failed: ${(error as Error).message}`)
    res.status(500).json({ error: 'Analysis failed' })
  }
})

app.post('/api/execute/:signalId', requireScope(tokens, 'trade:execute'), async (req, res) => {
  try {
    const { httpStatus, ...result } = await pipeline.executeSignal(req.params.signalId)
    res.status(httpStatus).json(result)
  } catch (error) {
    console.error(`Execution failed: ${(error as Error).message}`)
    res.status(500).json({ error: 'Execution failed' })
  }
})

listener.on('trade', (trade) => pipeline.enqueue(trade))
listener.on('error', (error: Error) => console.error(`Listener error: ${error.message}`))

server.listen(config.port, () => {
  console.log(`Agent middleware running on port ${config.port}`)
  console.log(`Execution mode: ${config.execution.live ? 'LIVE, real orders enabled' : 'dry run, no orders are sent'}`)
  if (!process.env.FIRECRAWL_API_KEY) console.warn('FIRECRAWL_API_KEY is not set, so every trade will fail web validation')
  if (!x402) console.warn('X402_PAY_TO is not set, so paid agent sessions are disabled')
  listener.start()
})

export { app, agentService, listener }
