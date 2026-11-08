# Phase 2 Architecture: Agent Middleware & Dashboard

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend Dashboard                        │
│              (React + Vite on localhost:3000)               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent Dashboard Page                                │  │
│  │  ├─ Real-time Trade Signals (WebSocket)             │  │
│  │  ├─ Risk Control Panel (Sliders)                    │  │
│  │  ├─ Tracked Wallets List                            │  │
│  │  └─ Dashboard Stats                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────┬──────────────────────────────────────────┬┘
                 │ WebSocket + REST                         │
                 │                                          │
┌────────────────▼──────────────────────────────────────────▼┐
│        Agent Middleware (Express on localhost:3001)        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  REST API Layer                                      │  │
│  │  ├─ GET /api/config (risk config)                  │  │
│  │  ├─ GET /api/trade-history                        │  │
│  │  ├─ POST /api/analyze-trade (trigger analysis)    │  │
│  │  └─ POST /api/risk-config (update thresholds)     │  │
│  ├─ WebSocket Server                                  │  │
│  │  └─ Broadcast TradeSignal events                  │  │
│  ├─ Trade Pipeline                                    │  │
│  │  ├─ PolymarketListener (detects trades)           │  │
│  │  ├─ AgentService (LLM analysis)                   │  │
│  │  └─ SignalBroadcaster (WebSocket)                 │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────┬──────────────────────────────────────────┬┘
                 │ CLOB API                                 │
                 │ Anthropic API                            │
                 │                                          │
┌────────────────▼──────────────────────────────────────────▼┐
│            External Services                               │
│  ├─ Polymarket CLOB (Trade Source)                        │
│  │  └─ Polling /trades endpoint                          │
│  └─ Claude API (Sentiment + Risk Analysis)               │
│     └─ Trade signal generation                           │
└──────────────────────────────────────────────────────────────┘
```

## Data Flow: Whale Trade → Signal

```
1. DETECTION PHASE
   ┌──────────────────────┐
   │ Whale Trade Occurs   │
   │ on Polymarket CLOB   │
   └──────────┬───────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ PolymarketListener polls trades  │
   │ (every 5 seconds)                │
   └──────────┬───────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ Trade Event Detected             │
   │ {market, tx, timestamp}          │
   └──────────┬───────────────────────┘

2. ANALYSIS PHASE
              │
              ▼
   ┌──────────────────────────────────┐
   │ Fetch Market Context             │
   │ ├─ Odds & liquidity              │
   │ ├─ 24h volume                    │
   │ └─ Trader count                  │
   └──────────┬───────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ Fetch Market Sentiment           │
   │ ├─ Bullish/bearish scores        │
   │ ├─ Social trends                 │
   │ └─ On-chain signals              │
   └──────────┬───────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ Claude AI Analysis               │
   │ (LLM decision engine)            │
   │ Considers:                       │
   │ ├─ Whale historical performance  │
   │ ├─ Market conditions             │
   │ ├─ Sentiment synthesis           │
   │ ├─ Risk parameters               │
   │ └─ Confidence thresholds         │
   └──────────┬───────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ Generate TradeSignal             │
   │ {                                │
   │   action: BUY|SELL|HOLD,         │
   │   position: YES|NO,              │
   │   confidence: 0.82,              │
   │   riskScore: 0.45,               │
   │   reasoning: "...",              │
   │   recommendation: EXECUTE|REVIEW │
   │ }                                │
   └──────────┬───────────────────────┘

3. BROADCAST PHASE
              │
              ▼
   ┌──────────────────────────────────┐
   │ Store in Trade History           │
   │ (in-memory buffer, max 1000)     │
   └──────────┬───────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ Broadcast via WebSocket          │
   │ to all connected dashboards      │
   └──────────┬───────────────────────┘
              │
              ▼
   ┌──────────────────────────────────┐
   │ Frontend Display                 │
   │ ├─ Add to signals feed           │
   │ ├─ Update stats                  │
   │ ├─ Color code by recommendation  │
   │ └─ Show reasoning                │
   └──────────────────────────────────┘
```

## Component Details

### 1. Frontend Dashboard (`DashboardAgent.tsx`)

**State Management:**
- `signals`: TradeSignal[] (real-time feed)
- `riskConfig`: User-adjustable risk parameters
- `trackedWallets`: Monitored whale addresses
- `wsConnected`: WebSocket connection status

**Key Features:**
- **Trade Signal Display**: Shows action, position, confidence, risk
- **Risk Sliders**: Adjust maxRiskScore and minConfidence in real-time
- **Auto-Execute Toggle**: Enable/disable automatic trade execution
- **Connection Indicator**: Green (connected) / Red (disconnected)
- **Dashboard Stats**: Total signals, execution rate, average confidence

**WebSocket Integration:**
```typescript
const ws = new WebSocket('ws://localhost:3001')
ws.onmessage = (event) => {
  const signal = JSON.parse(event.data)
  setSignals(prev => [signal, ...prev].slice(0, 50))
}
```

### 2. Agent Middleware (`bot-agent/src/index.ts`)

**Server Setup:**
- Express app on port 3001
- WebSocket server for real-time signals
- Client tracking for broadcast

**Request Pipeline:**
```typescript
POST /api/analyze-trade
  ↓
Call agentService.analyzeTradeSignal()
  ↓
Broadcast to all WebSocket clients
  ↓
Return signal JSON to caller
```

### 3. Polymarket Listener (`polymarketListener.ts`)

**Polling Strategy:**
- Default: 5-second polling interval
- Targets `/trades` endpoint on CLOB
- Filters by `TARGET_WHALE_ADDRESS`
- Returns last 50 transactions

**Event Emitter Pattern:**
```typescript
listener.on('trade', (event) => {
  // Process detected trade
})

listener.on('error', (err) => {
  // Handle polling errors
})
```

### 4. Agent Service (`agentService.ts`)

**Claude Integration:**
```typescript
const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: analysisPrompt }]
})
```

**Prompt Structure:**
1. Whale trade details
2. Market context (odds, volume, traders)
3. Sentiment analysis (bullish/bearish)
4. Risk parameters
5. Request JSON response

**Risk Decision Logic:**
```typescript
if (riskScore > maxRiskScore) return 'SKIP'
if (confidence < minConfidence) return 'REVIEW'
if (autoExecute && confidence > 0.75) return 'EXECUTE'
return 'REVIEW'
```

## Configuration Options

### Environment Variables (`.env`)
```env
ANTHROPIC_API_KEY=sk-ant-...      # Claude API key
TARGET_WHALE_ADDRESS=0x...         # Whale to track
POLYMARKET_CLOB_URL=https://...    # CLOB endpoint
PORT=3001                          # Server port
MIN_CONFIDENCE=0.65                # Min confidence
MAX_RISK_SCORE=0.7                 # Max risk
AUTO_EXECUTE=true                  # Auto execution
```

### Runtime Risk Config
```javascript
// Update via API
POST /api/risk-config {
  maxRiskScore: 0.6,
  minConfidence: 0.7,
  autoExecute: false
}

// Or via Dashboard sliders
```

## API Reference

### REST Endpoints

**Health Check**
```bash
GET /health
Response: { status: "Agent middleware online", timestamp: "..." }
```

**Get Configuration**
```bash
GET /api/config
Response: {
  riskConfig: { maxRiskScore, minConfidence, autoExecute },
  trackedWallets: ["0x..."]
}
```

**Get Trade History**
```bash
GET /api/trade-history?limit=50
Response: [
  {
    timestamp: "...",
    market: "...",
    action: "BUY",
    position: "YES",
    confidence: 0.82,
    riskScore: 0.45,
    reasoning: "...",
    recommendation: "EXECUTE"
  }
]
```

**Analyze Trade**
```bash
POST /api/analyze-trade
Body: {
  market: "market_id",
  transaction: { type: "BUY", amount: 1000 },
  whaleAddress: "0x..."
}
Response: TradeSignal
```

**Update Risk Config**
```bash
POST /api/risk-config
Body: {
  maxRiskScore: 0.6,
  minConfidence: 0.7,
  autoExecute: true
}
Response: { success: true, config: RiskConfig }
```

### WebSocket Events

**Signal Broadcast**
```json
{
  "timestamp": "2024-11-08T22:00:00Z",
  "market": "SOL_USD_2024Q4",
  "action": "BUY",
  "position": "YES",
  "confidence": 0.82,
  "riskScore": 0.45,
  "reasoning": "Strong bullish sentiment with whale entry",
  "sentimentSources": ["DEX volume", "Social mentions"],
  "recommendation": "EXECUTE"
}
```

## Performance Metrics

**Trade Processing Timeline:**
- Polling: 5 seconds
- Context fetch: ~200ms
- Claude analysis: ~1-2 seconds
- Signal broadcast: <100ms
- **Total latency: 1.5-2.5 seconds from trade to signal**

**Memory Usage:**
- Agent service: ~50MB
- Trade history buffer: ~5MB (1000 signals)
- WebSocket clients: ~1MB per connection
- **Total: ~100-200MB at scale**

## Security Considerations

1. **API Key Management**
   - Store ANTHROPIC_API_KEY in .env (not in code)
   - Never commit .env to version control
   - Rotate keys regularly

2. **Input Validation**
   - Validate market IDs and addresses
   - Sanitize trade transaction data
   - Limit request payload size

3. **Rate Limiting** (recommended for Phase 3)
   - Limit /analyze-trade calls
   - Throttle WebSocket messages
   - Implement request queuing

4. **Error Handling**
   - Log all errors
   - Don't expose sensitive data
   - Return safe error messages

## Scalability Path

**Phase 3 Enhancements:**
1. Multi-whale portfolio tracking
2. Database persistence (MongoDB/PostgreSQL)
3. Distributed agent workers (Bull queue)
4. Horizontal scaling with load balancer
5. Redis for session/cache management

**Current Limitations:**
- Single whale tracking
- In-memory trade history (lost on restart)
- Single server instance
- No persistent logging
