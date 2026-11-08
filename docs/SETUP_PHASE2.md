# Phase 2 Setup Guide

## Quick Start (5 minutes)

### 1. Get Anthropic API Key
```
1. Visit https://console.anthropic.com
2. Sign up or log in
3. Create an API key
4. Copy the key (starts with sk-ant-)
```

### 2. Configure Bot Agent
```bash
cd bot-agent
cp .env.example .env

# Edit .env:
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
TARGET_WHALE_ADDRESS=0xYourWhaleAddress
POLYMARKET_CLOB_URL=https://clob.polymarket.com
PORT=3001
```

### 3. Start Bot Agent
```bash
cd bot-agent
npm install
npm run dev

# Output should show:
# 🤖 Agent Middleware running on port 3001
# 📡 Monitoring whale: 0x...
# 🔗 Polymarket CLOB: https://clob.polymarket.com
```

### 4. Start Frontend (new terminal)
```bash
cd solana-dapp
npm run dev

# Opens on http://localhost:3000
```

### 5. Access Agent Dashboard
1. Go to http://localhost:3000
2. Click "Agent Dashboard" in navbar
3. Watch for real-time signals (connection indicator shows 🟢 when connected)

---

## What's Running

| Component | URL | Purpose |
|-----------|-----|---------|
| Frontend | http://localhost:3000 | React dashboard with agent signals |
| Agent Middleware | http://localhost:3001 | LLM decision layer + WebSocket |
| Polymarket CLOB | https://clob.polymarket.com | Whale trade source |

---

## Testing the Agent

### Test 1: Manual Trade Analysis
```bash
curl -X POST http://localhost:3001/api/analyze-trade \
  -H "Content-Type: application/json" \
  -d '{
    "market": "SOL_USD_2024Q4",
    "transaction": {
      "type": "LONG",
      "amount": 5000,
      "user": "0x123..."
    },
    "whaleAddress": "0x..."
  }'
```

### Test 2: Get Trade History
```bash
curl http://localhost:3001/api/trade-history
```

### Test 3: Update Risk Config
```bash
curl -X POST http://localhost:3001/api/risk-config \
  -H "Content-Type: application/json" \
  -d '{
    "maxRiskScore": 0.6,
    "minConfidence": 0.7,
    "autoExecute": true
  }'
```

### Test 4: WebSocket Signals (Node.js)
```javascript
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => console.log('Connected'));
ws.on('message', (data) => {
  const signal = JSON.parse(data);
  console.log('Trade Signal:', signal);
});
```

---

## Dashboard Features

### Trade Signals Feed
- **Real-time updates** via WebSocket
- **Color-coded recommendations**:
  - 🟢 **EXECUTE** (green) - Auto-copy ready
  - 🟠 **REVIEW** (orange) - Manual review needed
  - 🔴 **SKIP** (red) - Risk too high
- **Signal details**: Action (BUY/SELL), Position (YES/NO), Confidence, Risk

### Risk Control Panel
- **Max Risk Score**: Slider 0-100% (default 70%)
- **Min Confidence**: Slider 0-100% (default 65%)
- **Auto-Execute**: Toggle for trades ≥75% confidence
- **Tracked Wallets**: Display of monitored addresses

### Dashboard Stats
- **Total Signals**: Count of analyzed trades
- **Execution Rate**: % with EXECUTE recommendation
- **Avg Confidence**: Mean confidence across all signals

---

## Agent Decision Logic

When a whale trade is detected:

1. **Fetch Context**
   - Market odds, volume, liquidity
   - Sentiment scores (bullish/bearish)
   - 24h trends

2. **LLM Analysis** (Claude-3.5)
   - Analyze trade with full context
   - Generate confidence score
   - Calculate risk assessment
   - Produce trading reasoning

3. **Apply Risk Filters**
   - If riskScore > maxRiskScore → SKIP
   - If confidence < minConfidence → REVIEW
   - If autoExecute && confidence > 0.75 → EXECUTE

4. **Broadcast Signal**
   - Send via WebSocket to all connected dashboards
   - Store in trade history
   - Ready for Phase 3 execution

---

## Environment Variables Explained

```env
# Anthropic API (required for agent)
ANTHROPIC_API_KEY=sk-ant-...

# Target whale wallet to track
TARGET_WHALE_ADDRESS=0xYourAddress

# Polymarket data source
POLYMARKET_CLOB_URL=https://clob.polymarket.com

# Server port
PORT=3001

# Risk thresholds
MIN_CONFIDENCE=0.65      # 0-1 scale
MAX_RISK_SCORE=0.7       # 0-1 scale

# Auto-execution setting
AUTO_EXECUTE=true        # Auto-execute high-confidence trades
```

---

## Troubleshooting

### Agent not connecting to WebSocket?
- Check bot-agent is running: `curl http://localhost:3001/health`
- Verify frontend WebSocket URL: Check browser console
- Fix: Restart bot-agent: `npm run dev`

### No trade signals appearing?
- **Normal**: Polymarket mock returns empty for now
- To test: Use `/api/analyze-trade` endpoint manually
- Phase 3 will connect real Polymarket CLOB

### Claude API errors?
- Verify API key is valid: `echo $ANTHROPIC_API_KEY`
- Check rate limits: https://console.anthropic.com
- Ensure account has credits

### High latency?
- Default polling interval: 5 seconds
- Edit `src/services/polymarketListener.ts` to adjust
- Increase for slower polling, decrease for faster

---

## Next Steps

### Phase 3: E2E Execution
1. Deploy transaction execution on Polygon
2. Integrate Solana validators
3. Add transaction batching + gas optimization
4. Implement Google Gemini for media generation

### Monitoring & Analytics
- Dashboard trade performance metrics
- Whale success rate tracking
- Risk/reward analysis
- Backtesting engine

### Advanced Features
- Multi-whale portfolio tracking
- Sentiment API integrations
- Discord/Telegram notifications
- Advanced portfolio rebalancing

---

## Support

For issues:
1. Check logs: `npm run dev` shows real-time errors
2. Verify environment: `cat .env | grep -v "^#"`
3. Test endpoints manually with curl
4. Check Phase 2 summary for architecture details

**Dashboard is now live!** 🚀
