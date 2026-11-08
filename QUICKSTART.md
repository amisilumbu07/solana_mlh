# 🚀 Quick Start - solana_mlh

Get the AI Prediction Market Bot running in **5 minutes**.

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- npm (comes with Node)
- Git

## Step 1: Clone & Install (2 minutes)

```bash
# Clone repository
git clone https://github.com/amisilumbu07/solana_mlh.git
cd solana_mlh

# Install backend dependencies
cd bot-agent
npm install
cd ..

# Install frontend dependencies
cd solana-dapp
npm install
cd ..
```

## Step 2: Configure (1 minute)

```bash
cd bot-agent

# Copy configuration template
cp .env.example .env

# Edit .env and add your API keys:
# - FIRECRAWL_API_KEY (required) - Get free: https://firecrawl.dev
# - ANTHROPIC_API_KEY (required) - Get free: https://console.anthropic.com
```

Example `.env` after editing:
```env
FIRECRAWL_API_KEY=YOUR_FIRECRAWL_API_KEY
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
EXECUTION_MODE=dry_run
PORT=3001
```

## Step 3: Start Services (2 minutes)

```bash
# From project root (solana_mlh/)
chmod +x START_SERVICES.sh
./START_SERVICES.sh
```

You should see:
```
✅ All services started successfully!

📍 Access points:
   • Frontend:  http://localhost:3000
   • Bot API:   http://localhost:3001
   • WebSocket: ws://localhost:3001
```

## Step 4: Open Dashboard

Open your browser to **http://localhost:3000**

You should see:
- 🏠 **Dashboard**: Market overview
- 🤖 **Agent Dashboard**: Real-time AI signals
- 📊 **Signals Feed**: Trade analysis results
- ⚙️ **Risk Controls**: Confidence & risk thresholds

## How It Works

```
Whale Trade on Polymarket
         ↓
    Agent Middleware (Claude AI Analysis)
         ↓
   Firecrawl News Validation (Live headlines)
         ↓
   Dashboard Signal (with recommendation)
         ↓
   You Decide: Execute or Skip
```

## Understanding Signals

Each signal shows:

- **Action**: BUY, SELL, or HOLD
- **Confidence**: 0-100% (AI's certainty)
- **Risk Score**: 0-100% (potential downside)
- **Recommendation**:
  - 🟢 **EXECUTE** - Ready to copy
  - 🟠 **REVIEW** - Manual check needed
  - 🔴 **SKIP** - Too risky

## API Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### Get Configuration
```bash
curl http://localhost:3001/api/config
```

### View Trade History
```bash
curl http://localhost:3001/api/trade-history?limit=10
```

### Subscribe to Real-Time Signals
```javascript
// In browser console
const ws = new WebSocket('ws://localhost:3001')
ws.onmessage = (e) => console.log(JSON.parse(e.data))
```

## Stopping Services

```bash
# In terminal running START_SERVICES.sh
Press Ctrl+C

# Or manually stop
pkill -f "bot-agent" && pkill -f "solana-dapp"
```

## Viewing Logs

```bash
# Agent logs
tail -f /tmp/bot-agent.log

# Frontend logs
tail -f /tmp/solana-dapp.log
```

## Next: Enable Live Trading (Optional)

By default, `EXECUTION_MODE=dry_run` - no real trades are placed.

To enable live trading:

1. Set up Polymarket wallet with USDC
2. In `.env`, change: `EXECUTION_MODE=live`
3. Add: `POLYMARKET_PRIVATE_KEY=0x...`
4. Restart services

⚠️ **Warning**: Live mode executes real trades. Use carefully.

## Common Issues

### ❌ Port 3000 or 3001 already in use
```bash
# Find and kill process
lsof -i :3000
kill -9 <PID>
```

### ❌ API key errors
```
Check .env has correct values
FIRECRAWL_API_KEY=fc-...
ANTHROPIC_API_KEY=sk-ant-...
```

### ❌ WebSocket connection failed
```
Ensure bot-agent is running:
curl http://localhost:3001/health
```

### ❌ "npm: command not found"
```
Node.js not installed. Install from: https://nodejs.org/
```

## Configuration Options

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXECUTION_MODE` | `dry_run` | `dry_run` (safe) or `live` (trades) |
| `MIN_CONFIDENCE` | `0.65` | Min AI confidence (0-1) |
| `MAX_RISK_SCORE` | `0.7` | Max acceptable risk (0-1) |
| `AUTO_EXECUTE` | `false` | Auto-execute high-confidence trades |
| `LLM_PROVIDER` | `claude` | `claude`, `openai`, `ollama`, `gpt4free` |

See `bot-agent/.env.example` for all 50+ options.

## Documentation

- 📖 **FIRECRAWL_INTEGRATION.md** - How Firecrawl validates trades
- 🏗️ **PHASE3_SPECIFICATION.md** - Full architecture
- 🚀 **PHASE3_DEPLOYMENT.md** - Production deployment
- 🎯 **LAUNCH_CHECKLIST.md** - Pre-launch tasks
- 🔗 **LLM_PROVIDERS.md** - Using different AI models

## Support

1. Check relevant `.md` file in repo root
2. Review `.env.example` for all options
3. Check logs: `tail -f /tmp/bot-agent.log`
4. Verify ports: `lsof -i :3000 && lsof -i :3001`

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite + TailwindCSS
- **AI**: Claude (Anthropic) or OpenAI
- **News API**: Firecrawl (live validation)
- **Markets**: Polymarket CLOB API

## Next Steps

1. ✅ Verify signals on dashboard (should see trades within 5-10 min)
2. 📖 Read PHASE3_DEPLOYMENT.md for advanced config
3. 🔧 Enable additional LLM providers (OpenAI, Ollama, etc.)
4. 🚀 Deploy to production when ready

## Performance Targets

- Signal generation: 0.1-0.5s
- Firecrawl validation: 1-3s
- Dashboard update: <100ms
- E2E latency: 3-8s

---

**That's it! You're running an AI prediction market bot with live news validation. 🎉**

Questions? Check the documentation files or review bot logs.

Good luck! 🚀
