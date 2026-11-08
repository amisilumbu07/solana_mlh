# 🔥 Firecrawl Integration Guide

## Overview

**Firecrawl** is now integrated into the prediction market bot agent as the **validation layer**. Every trade signal from the AI agent must pass a real-time web validation to confirm it's corroborated by live news.

---

## What is Firecrawl?

Firecrawl crawls live websites and news sources to fetch current market sentiment and corroborating data. It's used to:

1. **Validate trade signals** - Confirm AI analysis with real-world news
2. **Check trade age** - Ensure the signal is recent (< 120 seconds old)
3. **Corroborate positions** - Require minimum 2 independent news sources
4. **Detect market sentiment** - Assess if market agrees with prediction

---

## Configuration

### Step 1: Get Firecrawl API Key

1. Visit [https://firecrawl.dev](https://firecrawl.dev)
2. Sign up for free account
3. Copy your API key

### Step 2: Add to .env

```bash
cd bot-agent
cp .env.example .env

# Edit .env and add your key:
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Validation Configuration

```env
# Maximum age of trade signal (120 seconds = 2 minutes)
MAX_TRADE_AGE_SECONDS=120

# Maximum allowed slippage between AI prediction and market reality (2%)
MAX_SLIPPAGE=0.02

# Minimum news sources that must corroborate trade (2 sources required)
MIN_CORROBORATING_DOMAINS=2
```

---

## How It Works

### Trade Flow with Firecrawl

```
1. AI Agent generates TradeSignal
   ├─ Market: "Bitcoin Price 2024Q4"
   ├─ Action: BUY
   ├─ Confidence: 85%
   └─ Reasoning: "Strong on-chain activity detected"

2. Signal → CopyPipeline → Validation Loop

3. Firecrawl Validation:
   ├─ 🔍 Search news for market keywords
   ├─ 📰 Crawl top N sources
   ├─ 📊 Extract sentiment & signals
   ├─ ✅ Corroborate with minimum N sources
   ├─ ⏱️  Check signal age (< 120s)
   └─ 💰 Verify slippage (< 2%)

4. Validation Result:
   ├─ PASS ✅ → Execute trade (if AUTO_EXECUTE=true)
   ├─ REVIEW 🔄 → Wait for human approval
   └─ SKIP ❌ → Discard signal

5. Execution → Settlement → Media Generation
```

---

## Validation Service

### FirecrawlService

**Location**: `bot-agent/src/services/firecrawlService.ts`

**Key Methods**:

```typescript
// Validate trade signal against live news
async validateSignal(signal: TradeSignal): Promise<ValidationResult>

// Fetch news for market
async fetchMarketNews(market: string, limit: number = 5): Promise<NewsArticle[]>

// Extract sentiment from news
async extractSentiment(articles: NewsArticle[]): Promise<Sentiment>

// Check corroboration count
checkCorroboration(sources: string[], required: number = 2): boolean
```

**ValidationResult**:
```typescript
{
  valid: boolean
  reason: string
  corroboratingDomains: string[]
  sentiment: "bullish" | "bearish" | "neutral"
  tradeAge: number // seconds since signal generated
  slippageDetected: number // actual vs predicted
}
```

---

## Copy Pipeline with Validation

### CopyPipeline Flow

**Location**: `bot-agent/src/services/copyPipeline.ts`

```typescript
// 1. Listen for whale trades
listener.onWhaleActivity(async (trade) => {
  
  // 2. Generate AI signal
  const signal = await agentService.analyze(trade)
  
  // 3. Validate with Firecrawl
  const validation = await firecrawl.validateSignal(signal)
  
  if (!validation.valid) {
    console.warn(`⚠️  Signal invalid: ${validation.reason}`)
    return // Stop here
  }
  
  // 4. Execute trade
  const execution = await execution.execute(signal)
  
  // 5. Generate media
  const media = await mediaGenerator.generatePackage(signal, execution)
  
  // 6. Broadcast to frontend
  broadcast({ signal, validation, execution, media })
})
```

---

## Execution Modes

### Dry Run (Default, Safe)

```env
EXECUTION_MODE=dry_run
COPY_RATIO=0.01  # 1% of whale position
MIN_ORDER_USDC=1
MAX_ORDER_USDC=5
MAX_DAILY_USDC=25
```

**What happens**:
- ✅ Validates signals
- ✅ Passes through Firecrawl
- ❌ Does NOT place orders
- ✅ Logs what would happen
- ✅ Good for testing

### Live Execution

```env
EXECUTION_MODE=live
COPY_RATIO=0.05  # 5% of whale position
MIN_ORDER_USDC=10
MAX_ORDER_USDC=50
MAX_DAILY_USDC=500

# Required for live:
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_SIGNATURE_TYPE=0
```

**What happens**:
- ✅ Validates signals
- ✅ Passes through Firecrawl
- ✅ Executes real trades
- ✅ Pays fees
- ⚠️  Risk of loss
- ⚠️  Only for production

---

## Risk Thresholds

```env
# AI confidence threshold (0-1)
MIN_CONFIDENCE=0.65

# Maximum acceptable risk score (0-1)
MAX_RISK_SCORE=0.7

# Age of signal (120 seconds = 2 minutes)
MAX_TRADE_AGE_SECONDS=120

# Maximum price deviation from prediction
MAX_SLIPPAGE=0.02  # 2%

# Minimum corroborating news sources
MIN_CORROBORATING_DOMAINS=2

# Position size (% of whale position)
COPY_RATIO=0.01  # 1%

# Order limits (USDC)
MIN_ORDER_USDC=1
MAX_ORDER_USDC=5
MAX_DAILY_USDC=25
```

---

## Session & Payment (X402)

Optional payment system to access premium features:

```env
# Leave blank to disable paid sessions
X402_PAY_TO=

# Session token cost (optional)
X402_SESSION_PRICE=$0.05

# Network (testnet vs mainnet)
X402_NETWORK=eip155:84532  # Base Sepolia testnet

# Facilitator URL (testnet only)
X402_FACILITATOR_URL=https://x402.org/facilitator

# Wallets allowed to execute (comma-separated)
X402_EXECUTE_ALLOWLIST=
```

---

## Running the Bot

### Option 1: Startup Script (Recommended)

```bash
cd /home/amisiespoir-07/dev/solana_mlh
chmod +x START_SERVICES.sh
./START_SERVICES.sh
```

**Starts**:
- ✅ Bot-agent (port 3001)
- ✅ Frontend (port 3000)
- ✅ WebSocket connection
- ✅ Firecrawl validation

### Option 2: Manual Start

Terminal 1 - Bot Agent:
```bash
cd bot-agent
npm run dev
# 🤖 Agent running on port 3001
# 🔥 Firecrawl validation active
```

Terminal 2 - Frontend:
```bash
cd solana-dapp
npm run dev
# 🎨 Frontend on http://localhost:3000
```

---

## Access Points

Once running:

- **Frontend**: http://localhost:3000
  - View real-time signals
  - Monitor validation results
  - See execution history

- **API**: http://localhost:3001
  - POST /api/analyze - Analyze trade
  - GET /api/validation-history - See validations
  - GET /api/performance - View metrics

- **WebSocket**: ws://localhost:3001
  - Real-time signal stream
  - Validation results
  - Execution updates

---

## Monitoring Validation

### Dashboard View

Frontend shows:
- ✅ Signals validated by Firecrawl
- 📰 Corroborating news sources
- 📊 Sentiment analysis
- ⏱️  Trade age & freshness
- 💰 Slippage detection

### Logs

```bash
# Bot-agent logs
tail -f /tmp/bot-agent.log

# Look for:
# ✅ Signal validated: market=X, confidence=Y, domains=Z
# ⚠️  Signal invalid: reason=expired
# ❌ Validation failed: low_corroboration
```

---

## Example Validation Flow

```
15:30:00 - Whale detected: 100 ETH BUY on Bitcoin Q4

15:30:01 - AI Agent analyzes
    • Confidence: 82%
    • Risk: 0.45
    • Action: BUY
    • Reasoning: "Strong on-chain signals"

15:30:02 - Firecrawl validates
    ✓ Fetching news...
    ✓ Searching "Bitcoin Q4 bullish"
    ✓ Found 5 articles
    ✓ Domain 1: Bloomberg - "Bitcoin Surge Expected"
    ✓ Domain 2: CoinDesk - "Market Sentiment Positive"
    ✓ Domain 3: Reuters - "Crypto Market Rally"
    ✓ Sentiment: BULLISH (82% positive)
    ✓ Trade age: 2 seconds (< 120s ✓)
    ✓ Slippage: 0.8% (< 2% ✓)
    ✓ Corroboration: 3 domains (>= 2 ✓)

15:30:03 - Validation PASSED ✅
    → Broadcasting signal to frontend
    → AUTO_EXECUTE=true? → Execute trade
    → Generate execution summary
    → Create media content

15:30:04 - Signal shown on dashboard
    Whale: Copy 1% = 1 ETH
    Entry: $43,200
    Est. Profit: $1,080 (if 2.5% move)
    Risk: 0.45/0.7 ✓
    Corroborated: Bloomberg, CoinDesk, Reuters
```

---

## Common Issues & Solutions

### "FIRECRAWL_API_KEY not configured"

```bash
# Solution: Add key to .env
FIRECRAWL_API_KEY=fc-xxxxxxxxxxxxxxxx
```

### "Signal validation timeout"

```bash
# Firecrawl is slow. Increase timeout or reduce search:
# Solution: Reduce MAX_TRADE_AGE_SECONDS or MIN_CORROBORATING_DOMAINS
```

### "Insufficient corroborating domains"

```env
# Signal didn't find enough news sources
# Solutions:
# 1. Lower MIN_CORROBORATING_DOMAINS=1
# 2. Wait for more news (trades age out in 120s)
# 3. Use different market keywords
```

### "Slippage too high"

```env
# Market moved too much since signal
# Solutions:
# 1. Increase MAX_SLIPPAGE=0.05  # 5%
# 2. Reduce MAX_TRADE_AGE_SECONDS=60
# 3. Lower COPY_RATIO
```

---

## Performance Tips

1. **Reduce Firecrawl calls**: Cache results for 10-30 seconds
2. **Batch validations**: Group signals by market before validating
3. **Parallel checks**: Validate multiple signals simultaneously
4. **Pre-fetch news**: Monitor key markets continuously
5. **Set reasonable thresholds**: Balance safety vs. execution rate

---

## Deployment

### Test Environment (Current)

```env
EXECUTION_MODE=dry_run
LLM_PROVIDER=claude
FIRECRAWL_API_KEY=YOUR_FIRECRAWL_API_KEY
MIN_CONFIDENCE=0.65
MAX_RISK_SCORE=0.7
MIN_CORROBORATING_DOMAINS=2
```

### Production Environment

```env
EXECUTION_MODE=live
LLM_PROVIDER=claude
FIRECRAWL_API_KEY=fc-[YOUR_PRODUCTION_KEY]
MIN_CONFIDENCE=0.75  # Higher threshold
MAX_RISK_SCORE=0.5   # Lower risk
MIN_CORROBORATING_DOMAINS=3  # More corroboration
POLYMARKET_PRIVATE_KEY=0x[YOUR_KEY]
MAX_DAILY_USDC=500   # Daily limit
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Whale Trade Detected                   │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│         AI Agent Analysis (LLM)                         │
│  ├─ Generate TradeSignal                               │
│  ├─ Set confidence score                               │
│  └─ Provide reasoning                                  │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│    Firecrawl Validation (Copy Pipeline)                 │
│  ├─ Fetch live news                                    │
│  ├─ Extract sentiment                                  │
│  ├─ Check corroboration                                │
│  ├─ Verify trade age                                   │
│  └─ Detect slippage                                    │
└─────────────────────────┬───────────────────────────────┘
                          ▼
                   ┌──────────────┐
                   │   VALID? ✅   │
                   └──────┬─────────┘
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
      EXECUTE ✅             SKIP/REVIEW ❌
      • Place order           • Log reason
      • Track TX              • Wait for news
      • Settle P&L            • Re-evaluate
      • Generate media        • Monitor market
```

---

## Next Steps

1. ✅ Start the bot: `./START_SERVICES.sh`
2. ✅ Open frontend: http://localhost:3000
3. ✅ Monitor validation logs
4. ✅ Test with dry_run mode
5. ✅ Verify Firecrawl working
6. 🚀 Deploy to production when ready

---

## Documentation

- **Architecture**: See PHASE3_SPECIFICATION.md
- **Agent**: See bot-agent/src/services/agentService.ts
- **Validation**: See bot-agent/src/services/copyPipeline.ts
- **Firecrawl**: See bot-agent/src/services/firecrawlService.ts

---

**Status**: ✅ INTEGRATED & READY
**Last Updated**: 2024-11-08

🔥 **Firecrawl is live. All trades are validated.**
