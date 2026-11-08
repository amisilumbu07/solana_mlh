# Phase 3 Implementation Guide

## Quick Start (30 minutes)

This guide walks through integrating Phase 3 services (transaction execution, settlement, media generation) into the existing Phase 2 agent.

---

## Step 1: Set Up Wallet & Network (10 min)

### 1.1 Generate Polygon Wallet

```bash
# Generate a new wallet for testnet
node -e "
const { ethers } = require('ethers');
const wallet = ethers.Wallet.createRandom();
console.log('Private Key:', wallet.privateKey);
console.log('Address:', wallet.address);
"
```

### 1.2 Get Testnet Funds

Visit [Polygon Faucet](https://faucet.polygon.technology/):
1. Paste your wallet address
2. Request MATIC on Amoy testnet
3. Wait 1-2 minutes for confirmation

### 1.3 Update .env

```bash
cp .env.example .env

# Edit .env and add:
POLYGON_AMOY_RPC=https://polygon-amoy.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
POLYGON_WALLET_PRIVATE_KEY=0x...  # From step 1.1
POLYGON_WALLET_ADDRESS=0x...      # From step 1.1
```

Get Alchemy key: https://dashboard.alchemy.com

---

## Step 2: Deploy Smart Contract (5 min)

### 2.1 Compile & Deploy

```bash
# Option A: Using Hardhat (if available)
cd bot-agent
npx hardhat compile
npx hardhat run scripts/deploy.js --network polygonAmoy

# Option B: Using Remix IDE (easiest for testnet)
# 1. Go to https://remix.ethereum.org
# 2. Create new file: PredictionMarketVault.sol
# 3. Copy contract code from contracts/PredictionMarketVault.sol
# 4. Compile (Ctrl+S)
# 5. Deploy to Polygon Amoy testnet
```

### 2.2 Get Contract Address

After deployment, copy the contract address:

```bash
# Add to .env:
MARKET_CONTRACT_ADDRESS=0x...  # From deployment
```

---

## Step 3: Integrate Phase 3 Services (15 min)

### 3.1 Import Services in index.ts

```typescript
// bot-agent/src/index.ts
import { TradeExecutor } from "./services/tradeExecutor";
import { TransactionManager } from "./services/transactionManager";
import { SettlementObserver } from "./services/settlementObserver";
import { MediaGenerator } from "./services/mediaGenerator";

// Initialize Phase 3 services
const tradeExecutor = new TradeExecutor();
const transactionManager = new TransactionManager();
const settlementObserver = new SettlementObserver();
const mediaGenerator = new MediaGenerator();

// Start polling
transactionManager.startPolling(5000);        // Check confirmations every 5s
settlementObserver.startMonitoring(10000);   // Check resolutions every 10s
```

### 3.2 Connect Trade Signal → Execution

```typescript
// bot-agent/src/index.ts

// When trade signal is generated (in agentService)
async function onTradeSignal(signal) {
  // Execute trade if recommendation is EXECUTE
  if (signal.recommendation === "EXECUTE") {
    const executionResult = await tradeExecutor.executeSignal(signal);
    
    if (executionResult.status === "CONFIRMED") {
      // Track transaction
      transactionManager.trackTransaction(
        executionResult.transactionHash,
        signal.marketId,
        walletAddress,
        executionResult.positionSize,
        executionResult.gasPrice || "50"
      );
      
      // Track market for settlement
      settlementObserver.trackMarket(signal.marketId);
    }
  }
}
```

### 3.3 Handle Market Settlement

```typescript
// bot-agent/src/index.ts

// When market resolves
settlementObserver.onResolution(async (resolution) => {
  console.log(`Market resolved: ${resolution.marketId}`);
  
  // Generate media package
  const settlement = {
    transactionHash: "...",
    marketId: resolution.marketId,
    position: "YES",
    positionSize: 100,
    executionPrice: 0.6,
    winningOutcome: resolution.winningOutcome,
    won: true,
    payout: 200,
    profitLoss: 100,
    roi: 100,
    settledAt: new Date(),
  };
  
  const mediaPackage = await mediaGenerator.generateMediaPackage({
    marketTitle: "Bitcoin Price 2024Q4",
    marketId: resolution.marketId,
    winningOutcome: resolution.winningOutcome,
    profitLoss: settlement.profitLoss,
    roi: settlement.roi,
    tradeDetails: settlement,
  });
  
  // Broadcast media to frontend
  broadcastToClients({
    type: "MARKET_RESOLUTION",
    data: {
      settlement,
      media: mediaPackage,
    },
  });
});
```

---

## Step 4: Add REST API Endpoints (Optional)

```typescript
// bot-agent/src/index.ts

// Execute trade manually
app.post("/api/execute-trade", async (req, res) => {
  const { signal } = req.body;
  const result = await tradeExecutor.executeSignal(signal);
  res.json(result);
});

// Get transaction history
app.get("/api/transactions", (req, res) => {
  const history = transactionManager.getTransactionHistory(50);
  res.json(history);
});

// Get performance metrics
app.get("/api/performance", (req, res) => {
  const metrics = settlementObserver.getPerformanceMetrics();
  res.json(metrics);
});

// Get generated media
app.get("/api/media/:marketId", (req, res) => {
  const { marketId } = req.params;
  const media = mediaGenerator.getMediaHistory(marketId);
  res.json(media);
});

// Get wallet balance
app.get("/api/wallet-balance", async (req, res) => {
  const balance = await tradeExecutor.getWalletBalance();
  res.json({ balance });
});
```

---

## Step 5: Test End-to-End (Optional)

### 5.1 Manual Test

```typescript
// Create test trade signal
const testSignal = {
  marketId: "test-market-123",
  action: "BUY",
  position: "YES",
  confidence: 0.85,
  riskScore: 0.3,
  reasoning: "Test signal",
  recommendation: "EXECUTE",
};

// Execute
const result = await tradeExecutor.executeSignal(testSignal);
console.log("Execution result:", result);

// Check balance
const balance = await tradeExecutor.getWalletBalance();
console.log("Wallet balance:", balance);
```

### 5.2 Monitor Confirmations

```bash
# Terminal 1: Watch transaction confirmations
node -e "
const { TransactionManager } = require('./dist/services/transactionManager');
const tm = new TransactionManager();
tm.startPolling(5000);
setInterval(() => {
  const pending = tm.getPendingTransactions();
  console.log('Pending:', pending.length);
}, 10000);
"
```

### 5.3 Monitor Settlements

```bash
# Terminal 2: Watch market resolutions
node -e "
const { SettlementObserver } = require('./dist/services/settlementObserver');
const so = new SettlementObserver();
so.startMonitoring(10000);
so.onResolution((res) => {
  console.log('MARKET RESOLVED:', res.marketId, res.winningOutcome);
});
"
```

---

## Configuration Reference

### TradeExecutor Config

```typescript
const executor = new TradeExecutor({
  maxPositionSize: 1000,        // Max USD per trade
  kellyFraction: 0.25,          // 1/4 kelly for safety
  gasLimit: 300000,             // Polygon gas limit
  minConfidenceForExecution: 0.6,
  bankroll: 10000,              // Portfolio size for kelly
});
```

### TransactionManager Config

```typescript
transactionManager.startPolling(5000);  // Check every 5 seconds
// Tracks confirmations: 1, 3, 6, 12 blocks
```

### SettlementObserver Config

```typescript
settlementObserver.startMonitoring(10000); // Check every 10 seconds
settlementObserver.trackMarket("market-id");
```

### MediaGenerator Config

```bash
GOOGLE_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
ENABLE_MEDIA_GENERATION=true
MEDIA_STORAGE_PATH=./media
```

---

## Error Handling

### Common Issues

**Issue**: "POLYGON_AMOY_RPC not set in environment"
```bash
# Solution: Add to .env
POLYGON_AMOY_RPC=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
```

**Issue**: "Insufficient balance"
```bash
# Solution: Send more MATIC from faucet
# Check balance: await tradeExecutor.getWalletBalance()
```

**Issue**: "Market contract not found"
```bash
# Solution: Deploy PredictionMarketVault.sol first
# Set MARKET_CONTRACT_ADDRESS in .env
```

**Issue**: "Google API key invalid"
```bash
# Solution: Get new key from https://makersuite.google.com/app/apikey
# Ensure Gemini API is enabled
```

---

## Performance Tips

### Optimize Gas Usage

```typescript
// Use EIP-1559 dynamic pricing
const gasPrice = await tradeExecutor.getOptimizedGasPrice();
// Returns 10% above current price for faster confirmation
```

### Batch Transactions

```typescript
// Instead of: execute 10 trades separately
// TODO: Implement batch execution for lower gas costs
```

### Reduce API Calls

```typescript
// Cache market data for 30 seconds
// Reduce confirmation polling to 10 seconds for testnets
```

---

## Monitoring & Observability

### Check Execution Stats

```typescript
const stats = tradeExecutor.getExecutionStats();
console.log(`Executed: ${stats.confirmed}/${stats.total}`);
console.log(`Success rate: ${stats.successRate}%`);
console.log(`Total volume: $${stats.totalVolume.toFixed(2)}`);
```

### View Performance Metrics

```typescript
const metrics = settlementObserver.getPerformanceMetrics();
console.log(`Win rate: ${(metrics.winRate * 100).toFixed(1)}%`);
console.log(`Net profit: $${metrics.netProfit.toFixed(2)}`);
console.log(`Sharpe ratio: ${metrics.sharpeRatio}`);
```

### Export History

```bash
# Export transaction history
const csv = transactionManager.exportAsCSV();
fs.writeFileSync("transactions.csv", csv);

# Export settlement history
const settlements = settlementObserver.exportAsCSV();
fs.writeFileSync("settlements.csv", settlements);

# Export media history
const media = mediaGenerator.exportAsJSON();
fs.writeFileSync("media_history.json", media);
```

---

## Deployment Checklist

- [ ] Wallet created & funded with testnet MATIC
- [ ] Smart contract deployed to Polygon Amoy
- [ ] `.env` configured with all keys
- [ ] TradeExecutor initialized
- [ ] TransactionManager polling active
- [ ] SettlementObserver monitoring active
- [ ] MediaGenerator with Google API key
- [ ] REST endpoints added (optional)
- [ ] WebSocket integration tested
- [ ] End-to-end flow verified

---

## Next Steps

### Phase 3A: Testing & Optimization
1. Run full E2E test with mock signals
2. Optimize gas usage
3. Test recovery mechanisms
4. Add error retry logic

### Phase 3B: Production Hardening
1. Move to Polygon mainnet
2. Add multi-wallet support
3. Implement rate limiting
4. Add comprehensive logging

### Phase 3C: Advanced Features
1. Portfolio rebalancing
2. Advanced sentiment analysis
3. Backtesting engine
4. Performance analytics dashboard

---

## Support & Resources

**Polygon Docs**: https://wiki.polygon.technology/
**Ethers.js Docs**: https://docs.ethers.org/v6/
**Google Gemini API**: https://ai.google.dev/docs
**Polymarket CLOB**: https://clob.polymarket.com/docs

---

**Last Updated**: 2024-11-08
**Status**: READY TO IMPLEMENT
**Estimated Time**: 30-45 minutes setup + 2-4 hours integration testing
