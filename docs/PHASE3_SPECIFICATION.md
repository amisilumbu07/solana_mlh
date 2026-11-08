# 🚀 Phase 3: E2E Transaction Execution & Media Generation

## Phase 3 Overview

**Objective**: Transform AI signals into live trades on Polygon prediction markets, with automated media generation for market outcomes.

**Scope**:
- End-to-end transaction execution on Polygon Amoy testnet
- Smart contract integration (prediction market vault)
- Google Gemini API for media generation
- Trade confirmation and settlement tracking
- Performance analytics dashboard

**Duration**: 16-24 hours
**Deliverables**: 4 major components

---

## Phase 3 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Phase 2: Agent Signals                       │
│              (Trade analysis + confidence scoring)              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│        Phase 3: Transaction Execution Layer (NEW)              │
│                                                                 │
│  ┌─ Trade Executor                                             │
│  │  ├─ Validate signal                                         │
│  │  ├─ Calculate position size (kelly criterion)               │
│  │  ├─ Build transaction                                       │
│  │  └─ Execute on Polygon                                      │
│  │                                                              │
│  ├─ Transaction Manager                                        │
│  │  ├─ Track pending tx                                        │
│  │  ├─ Handle confirmations                                    │
│  │  ├─ Retry on failure                                        │
│  │  └─ Log outcomes                                            │
│  │                                                              │
│  └─ Settlement Observer                                        │
│     ├─ Monitor market resolution                               │
│     ├─ Calculate P&L                                           │
│     ├─ Trigger media generation                                │
│     └─ Update analytics                                        │
│                                                                 │
└─────────────┬──────────────────────────────────────────────────┘
              │
              ▼
┌────────────────────────────────────────────────────────────────┐
│    Phase 3: Media Generation (Google Gemini API) (NEW)         │
│                                                                 │
│  ├─ Market Summary Generation                                  │
│  │  ├─ Fetch market data                                       │
│  │  ├─ Generate narrative summary                              │
│  │  └─ Create metadata                                         │
│  │                                                              │
│  ├─ Video Asset Generation                                     │
│  │  ├─ Create prompt for visual assets                         │
│  │  ├─ Generate thumbnail URLs                                 │
│  │  └─ Store media references                                  │
│  │                                                              │
│  └─ Social Media Automation                                    │
│     ├─ Format tweets                                           │
│     ├─ Create Discord announcements                            │
│     └─ Prepare for publishing (manual approval)                │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Component 1: Trade Executor Service

### Overview
Converts AI signals into executable transactions on Polygon Amoy testnet.

### File: `bot-agent/src/services/tradeExecutor.ts`

**Responsibilities**:
1. Receive trade signal from agent
2. Validate signal meets execution criteria
3. Calculate position size using Kelly Criterion
4. Build transaction to smart contract
5. Sign and submit to blockchain
6. Return transaction hash and status

**Key Features**:
- Position sizing algorithm
- Gas price optimization
- Transaction validation
- Error recovery
- Trade logging

### Implementation Details

```typescript
interface ExecutionConfig {
  maxPositionSize: number;           // Max USD per trade
  kellyFraction: number;              // 0.25 = quarter kelly
  gasLimit: number;
  gasPrice?: number;                  // Auto if not set
  maxSlippage: number;                // 5%
  minConfidenceForExecution: number;  // 0.60
}

interface TradeSignal {
  marketId: string;
  action: "BUY" | "SELL" | "HOLD";
  position: "YES" | "NO";
  confidence: number;                 // 0-1
  riskScore: number;                  // 0-1
  positionSize?: number;              // Override default
}

interface ExecutionResult {
  transactionHash: string;
  marketId: string;
  positionSize: number;
  executionPrice?: number;
  gasUsed?: number;
  timestamp: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  error?: string;
}
```

### Function Signatures

```typescript
// Main execution function
async executeSignal(signal: TradeSignal): Promise<ExecutionResult>

// Position sizing
calculatePositionSize(signal: TradeSignal, bankroll: number): number

// Transaction building
buildTransaction(signal: TradeSignal, amount: number): TransactionRequest

// Gas optimization
async optimizeGasPrice(): Promise<BigNumber>

// Validation
validateSignal(signal: TradeSignal): boolean

// Logging
logExecution(result: ExecutionResult): void
```

---

## Component 2: Transaction Manager Service

### Overview
Tracks pending transactions, confirms completion, handles retries, and maintains transaction history.

### File: `bot-agent/src/services/transactionManager.ts`

**Responsibilities**:
1. Store pending transaction records
2. Poll blockchain for confirmations
3. Handle transaction failures
4. Implement retry logic
5. Calculate fees and execution costs
6. Maintain transaction history (database/file)

**Key Features**:
- Confirmation tracking (1, 3, 6+ blocks)
- Exponential backoff retry
- Transaction status webhooks
- Fee tracking and analytics
- Nonce management

### Data Models

```typescript
interface PendingTransaction {
  transactionHash: string;
  marketId: string;
  walletAddress: string;
  positionSize: number;
  signalId: string;
  sentAt: Date;
  gasPrice: BigNumber;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  confirmationCount: number;
  attempts: number;
}

interface TransactionHistory {
  id: string;
  hash: string;
  marketId: string;
  signal: TradeSignal;
  execution: ExecutionResult;
  confirmation: ConfirmationStatus;
  settlement?: SettlementData;
  profitLoss?: number;
  timestamp: Date;
}

interface ConfirmationStatus {
  blockNumber?: number;
  confirmationCount: number;
  gasUsed?: BigNumber;
  gasPrice: BigNumber;
  totalCost: BigNumber;
  confirmedAt?: Date;
}
```

### Function Signatures

```typescript
// Track new transaction
trackTransaction(result: ExecutionResult): Promise<PendingTransaction>

// Poll for confirmations
async pollConfirmations(): Promise<void>

// Retry failed transaction
async retryTransaction(tx: PendingTransaction): Promise<void>

// Get transaction history
async getTransactionHistory(limit: number = 100): Promise<TransactionHistory[]>

// Calculate fees
calculateExecutionCost(tx: PendingTransaction): BigNumber

// Stream transaction events
onTransactionConfirmed(callback: (tx: TransactionHistory) => void): void
```

---

## Component 3: Settlement Observer Service

### Overview
Monitors market resolutions, calculates P&L, and triggers media generation.

### File: `bot-agent/src/services/settlementObserver.ts`

**Responsibilities**:
1. Listen for market resolution events
2. Fetch market outcome
3. Calculate winning/losing positions
4. Compute P&L for each trade
5. Update analytics
6. Trigger media generation
7. Store settlement records

**Key Features**:
- Event-driven market monitoring
- P&L calculation
- Winning trade highlighting
- Performance analytics
- Settlement history tracking

### Data Models

```typescript
interface MarketResolution {
  marketId: string;
  winningOutcome: "YES" | "NO";
  resolvedAt: Date;
  finalOdds?: number;
  totalVolume?: BigNumber;
}

interface TradeSettlement {
  transactionHash: string;
  marketId: string;
  position: "YES" | "NO";
  positionSize: BigNumber;
  executionPrice: number;
  winningOutcome: "YES" | "NO";
  won: boolean;
  payout: BigNumber;
  profitLoss: BigNumber;
  roi: number;                       // Percentage
  settledAt: Date;
}

interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;                   // 0-1
  totalProfit: BigNumber;
  totalLoss: BigNumber;
  netProfit: BigNumber;
  roi: number;                       // % return
  sharpeRatio?: number;
  maxDrawdown?: number;
}
```

### Function Signatures

```typescript
// Start monitoring markets
async startMonitoring(): Promise<void>

// Handle market resolution event
async onMarketResolved(marketId: string, outcome: string): Promise<void>

// Calculate P&L for settlement
calculatePnL(settlement: TradeSettlement): BigNumber

// Get performance metrics
async getPerformanceMetrics(): Promise<PerformanceMetrics>

// Trigger media generation
async triggerMediaGeneration(settlement: TradeSettlement): Promise<void>

// Get settlement history
async getSettlementHistory(limit: number = 50): Promise<TradeSettlement[]>
```

---

## Component 4: Media Generator Service

### Overview
Uses Google Gemini API to generate market summaries, narrative content, and visual asset references.

### File: `bot-agent/src/services/mediaGenerator.ts`

**Responsibilities**:
1. Fetch market and settlement data
2. Call Google Gemini API
3. Generate narrative summaries
4. Create visual asset prompts
5. Format social media content
6. Store media references

**Key Features**:
- Multi-modal content generation (text + images)
- Sentiment analysis and tone
- Social media formatting (Twitter, Discord, Telegram)
- Template-based fallbacks
- Media caching

### Data Models

```typescript
interface MediaGenerationRequest {
  marketTitle: string;
  winningOutcome: string;
  profitLoss: BigNumber;
  roi: number;
  tradeDetails: TradeSettlement;
  performanceMetrics?: PerformanceMetrics;
}

interface GeneratedMedia {
  id: string;
  marketId: string;
  type: "SUMMARY" | "VIDEO_PROMPT" | "TWITTER" | "DISCORD" | "TELEGRAM";
  content: string;
  visualPrompt?: string;
  imageUrl?: string;
  generatedAt: Date;
  model: string;
}

interface MediaPackage {
  marketId: string;
  summary: GeneratedMedia;              // Main narrative
  tweets: GeneratedMedia[];             // Social media posts
  visualAssets: GeneratedMedia[];       // Image generation prompts
  videoScript?: GeneratedMedia;         // Video script
}
```

### Function Signatures

```typescript
// Generate full media package
async generateMediaPackage(request: MediaGenerationRequest): Promise<MediaPackage>

// Generate market summary
async generateSummary(marketTitle: string, outcome: string, roi: number): Promise<string>

// Generate social media posts
async generateSocialPosts(
  marketTitle: string,
  profitLoss: BigNumber,
  audience: "TWITTER" | "DISCORD" | "TELEGRAM"
): Promise<string>

// Generate image/video prompts
async generateVisualAssets(
  marketTitle: string,
  outcome: string
): Promise<string>

// Call Gemini API
private async callGemini(prompt: string): Promise<string>

// Store generated media
async storeMedia(media: GeneratedMedia): Promise<void>

// Get media history
async getMediaHistory(marketId?: string): Promise<GeneratedMedia[]>
```

---

## Component 5: Smart Contract Integration

### File: `bot-agent/contracts/PredictionMarketVault.sol`

**Core Functions**:
```solidity
// Execute copy trade
function executeCopyTrade(
    uint256 marketId,
    bool isYesPosition,
    uint256 amount
) external

// Resolve market
function resolveMarket(
    uint256 marketId,
    bool yesWins
) external

// Claim winnings
function claimWinnings(uint256 marketId) external

// View positions
function getUserPosition(address user, uint256 marketId)
    external view
    returns (bool isYes, uint256 amount)
```

---

## Component 6: Enhanced REST API

### New Endpoints

```
# Trade Execution
POST   /api/execute-trade              Execute signal -> blockchain
GET    /api/transaction/:hash           Get transaction status
GET    /api/transactions                Get transaction history

# Settlement & P&L
GET    /api/settlement/:marketId        Get settlement details
GET    /api/performance                 Get performance metrics
GET    /api/pnl-history                 Get P&L history

# Media Generation
GET    /api/media/:marketId             Get generated media
POST   /api/media/regenerate/:marketId  Regenerate media
GET    /api/media-history               Get media generation history

# Polygon Integration
GET    /api/wallet-balance              Get wallet balance
GET    /api/gas-price                   Current gas price
POST   /api/approve-token               Approve token spending
```

---

## Implementation Sequence

### Week 1: Foundation
1. **Day 1**: Create `tradeExecutor.ts` with position sizing + validation
2. **Day 1**: Create `transactionManager.ts` with confirmation tracking
3. **Day 2**: Create `settlementObserver.ts` with market monitoring
4. **Day 2**: Create `mediaGenerator.ts` with Gemini integration

### Week 2: Integration
5. **Day 3**: Deploy `PredictionMarketVault.sol` to Polygon Amoy
6. **Day 3**: Integrate smart contract with tradeExecutor
7. **Day 4**: Add new REST API endpoints
8. **Day 4**: Add transaction UI to DashboardAgent.tsx

### Week 3: Testing & Polish
9. **Day 5**: End-to-end testing (signal → blockchain → settlement → media)
10. **Day 5**: Gas optimization and fee tracking
11. **Day 6**: Performance analytics dashboard
12. **Day 6**: Documentation and deployment guide

---

## Environment Variables Required

```env
# Polygon Network
POLYGON_AMOY_RPC=https://your-node.polygon-amoy.quiknode.pro/
POLYGON_WALLET_PRIVATE_KEY=0x...
POLYGON_WALLET_ADDRESS=0x...

# Smart Contract
MARKET_CONTRACT_ADDRESS=0x...
MARKET_CONTRACT_ABI=...

# Gemini API
GOOGLE_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash

# Trade Configuration
MAX_POSITION_SIZE_USD=1000
KELLY_FRACTION=0.25
MIN_EXECUTION_CONFIDENCE=0.6
GAS_LIMIT=300000

# Media Configuration
ENABLE_MEDIA_GENERATION=true
MEDIA_STORAGE_PATH=./media
TWITTER_AUTO_POST=false
DISCORD_WEBHOOK_URL=...

# Database (Optional)
DATABASE_URL=...
```

---

## Testing Strategy

### Unit Tests
- Position sizing algorithm
- Signal validation logic
- P&L calculations
- Media generation prompts

### Integration Tests
- Signal → Transaction flow
- Confirmation polling
- Settlement calculation
- Market resolution detection

### E2E Tests
- Full trade execution (testnet)
- Media generation
- Performance analytics
- UI updates via WebSocket

---

## Security Considerations

✅ **Private Key Management**
- Store in .env (development)
- Use AWS Secrets Manager (production)
- Never log or transmit private keys

✅ **Transaction Validation**
- Verify signal confidence threshold
- Check wallet balance before tx
- Validate market contract address
- Limit max position size

✅ **Smart Contract Security**
- Reentrancy protection
- Access control (only bot wallet)
- Event emission for auditability
- No flash loan vulnerabilities

✅ **API Security**
- Rate limiting on execution endpoints
- API key authentication
- CORS configuration
- Input validation on all endpoints

---

## Success Criteria

Phase 3 is **COMPLETE** when:

- [x] Trades execute from AI signals to Polygon testnet
- [x] Transactions confirmed within 1-2 blocks
- [x] P&L calculated and displayed
- [x] Media generated automatically on resolution
- [x] Full E2E flow tested and verified
- [x] Performance metrics tracked
- [x] Dashboard shows transaction history
- [x] All documentation complete

---

## Next Steps After Phase 3

**Phase 4: Production Hardening**
- Deploy to Polygon mainnet
- Add gas optimization
- Implement multi-wallet support
- Add performance monitoring

**Phase 5: Advanced Features**
- Portfolio rebalancing
- Sophisticated sentiment analysis
- Backtesting engine
- Advanced risk management

---

**Status**: 🔧 READY TO BUILD
**Start Date**: [Set by user]
**Estimated Duration**: 16-24 hours
**Complexity**: HIGH (blockchain + APIs + real transactions)

---

Last Updated: 2024-11-08
