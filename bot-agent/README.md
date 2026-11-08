# Prediction Market Bot Agent - Phase 2

LLM-powered agent middleware for analyzing whale trades and generating copy-trading signals with sentiment analysis.

## Architecture

### Core Components

1. **Polymarket Listener** (`polymarketListener.ts`)
   - Monitors Polymarket CLOB API for whale wallet activity
   - Polls for transactions at configurable intervals
   - Emits trade events for agent analysis

2. **Agent Service** (`agentService.ts`)
   - Claude-3.5 Sonnet LLM integration
   - Analyzes trades with market context and sentiment
   - Generates confidence/risk scores
   - Stores trade history with recommendations

3. **Express Backend** (`index.ts`)
   - REST API endpoints for configuration and history
   - WebSocket server for real-time signal broadcasting
   - Trade analysis pipeline

## Setup

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Update with your values:
# - ANTHROPIC_API_KEY (get from https://console.anthropic.com)
# - TARGET_WHALE_ADDRESS (Polymarket address to track)
# - QUICKNODE_RPC_URL (optional, for on-chain queries)
```

## Running the Agent

```bash
# Development with hot reload
npm run dev

# Production build and run
npm run build
npm start
```

## API Endpoints

| Route | Access |
|---|---|
| `GET /health`, `/api/config`, `/api/wallets`, `/api/trade-history?limit=` | Open |
| `POST /api/session` | x402 payment |
| `POST /api/session/dashboard` | Local dashboard only |
| `POST /api/risk-config` | Session with `config:write` |
| `POST /api/analyze-trade` | Session with `analyze` |
| `POST /api/execute/:signalId` | Session with `trade:execute` |

## Authorization

Agents call `POST /api/session`, receive HTTP 402 with payment terms in the `PAYMENT-REQUIRED` header, and retry with a `PAYMENT-SIGNATURE` header. The response is a short-lived session token, sent afterwards as `Authorization: Bearer <token>`.

A payment proves that someone paid, not who they are. Every paid session gets `analyze`, and only payers listed in `X402_EXECUTE_ALLOWLIST` also get `trade:execute`. The dashboard gets a 15-minute `config:write` token held in memory, and it can never trade. Don't put this agent behind a reverse proxy without changing the dashboard route, because every caller would look local.

## Validation Loop

Each new whale trade goes through `copyPipeline.ts`:

1. Trades that are stale or under `MIN_WHALE_NOTIONAL_USDC` are dropped before spending any credits.
2. Firecrawl fetches recent news about the market, plus general macro news. `FIRECRAWL_API_KEY` is read from the server environment only.
3. The LLM scores the trade and labels each article as supporting, contradicting or neutral.
4. `validation.ts` applies fixed rules. All must pass: the whale bought, the trade is fresh, articles were found, enough different sites about this market support it, support outweighs contradiction, and the best ask is within `MAX_SLIPPAGE` of the whale's price.
5. Only an `EXECUTE` signal that passes every rule reaches the CLOB, as a fill-or-kill order within `MAX_ORDER_USDC` and `MAX_DAILY_USDC`.

Scraped pages are untrusted, so the LLM's labels alone can't approve a trade. If Firecrawl is down, nothing executes.

The default is a dry run. Real orders need `EXECUTION_MODE=live` and `POLYMARKET_PRIVATE_KEY`. Check that Polymarket is available to you where you are before enabling it.

## WebSocket Events

Connect to `ws://localhost:3001` to receive real-time trade signals:

```json
{
  "timestamp": "2024-11-08T22:00:00Z",
  "market": "market_id",
  "action": "BUY|SELL|HOLD",
  "position": "YES|NO",
  "confidence": 0.82,
  "riskScore": 0.45,
  "reasoning": "Analysis summary...",
  "recommendation": "EXECUTE|REVIEW|SKIP"
}
```

## Agent Decision Logic

The Claude AI agent considers:

1. **Trade Characteristics**
   - Position size and type
   - Market conditions
   - Execution timing

2. **Market Context**
   - Current odds and liquidity
   - 24h volume trends
   - Market age and trader count

3. **Sentiment Analysis**
   - Market bullish/bearish scores
   - Social trend signals
   - On-chain activity metrics

4. **Risk Assessment**
   - Confidence threshold (default 65%)
   - Max risk score (default 70%)
   - Auto-execute criteria (>75% confidence)

## Recommendations

- **EXECUTE**: High confidence, passes risk filters, ready for immediate copy
- **REVIEW**: Manual review recommended before execution
- **SKIP**: Risk parameters exceeded or low confidence

## Integration with Frontend

The frontend dashboard connects via WebSocket to:
- Receive real-time trade signals
- Update risk configuration
- View trade history
- Monitor whale activity

## Next Steps (Phase 3)

- E2E transaction execution on Polygon/Solana
- Google Gemini API for media generation on market resolution
- Advanced sentiment data integration
- Backtesting historical trades
