# Automated AI Prediction Market & Copy-Bot MVP Specification

This document serves as the developer roadmap for an AI agent to construct a working, rapid MVP over a **48-hour development cycle**.

The system links automated prediction market signals using QuickNode's Polymarket copy-bot architecture, onchain settlement, and dynamic media creation for winning market outcomes via Google APIs.

## Technical References & Repositories

* **Polymarket Copy-Bot Base:** [quiknode-labs/qn-guide-examples/defi/polymarket-copy-bot](https://github.com/quiknode-labs/qn-guide-examples/tree/main/defi/polymarket-copy-bot)
* **Chain & RPC:** Polygon Network / Amoy Testnet via QuickNode RPC
* **Order Book Integration:** Polymarket CLOB API / `py-clob-client`

## Technical Stack & Architecture

* **Frontend:** Single-file React / Tailwind CSS dashboard with Web3 wallet modal (Ethers.js / Viem).
* **Backend / Bot Logic:** Node.js/TypeScript background worker leveraging the QuickNode Polymarket copy-bot architecture.
* **Smart Contracts:** Simplified prediction market & vault contract (Solidity on Polygon Amoy).
* **Media Engine:** Google AI Gemini API for recap text generation and dynamic video/visual asset creation.

## Implementation Roadmap (48-Hour Build Schedule)

```
+-------------------------------------------------------------------+
|  Phase 1: Core Engine & Copy-Bot Integration (Hours 0 - 16)       |
|  - Smart Contracts & QuickNode Polymarket Bot Integration         |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  Phase 2: Interactive UI & Dynamic Media Engine (Hours 16 - 32)   |
|  - Web3 Interface & Google API Video Generator Integration        |
+-------------------------------------------------------------------+
                                  |
                                  v
+-------------------------------------------------------------------+
|  Phase 3: E2E Integration, Testing & MVP Polish (Hours 32 - 48)   |
|  - End-to-End Execution Flow & Demo Verification                  |
+-------------------------------------------------------------------+
```

---

## Phase 1: Core Engine & Bot Infrastructure (Hours 0 – 16)

### 1.1 Polymarket Copy-Bot Integration
Adapt the core listener and trading engine from [`quiknode-labs/qn-guide-examples`](https://github.com/quiknode-labs/qn-guide-examples/tree/main/defi/polymarket-copy-bot) to listen for whale wallet trades and relay signals.

```typescript
// bot-listener.ts - Adapted from QuickNode Polymarket Copy-Bot Example
import { ethers } from "ethers";

const QUICKNODE_RPC_URL = process.env.QUICKNODE_RPC_URL;
const TARGET_WHALE_ADDRESS = process.env.TARGET_WHALE_ADDRESS;
const CONTRACT_ADDRESS = process.env.MARKET_CONTRACT_ADDRESS;

async function listenAndCopy() {
    const provider = new ethers.JsonRpcProvider(QUICKNODE_RPC_URL);
    console.log(`[QuickNode Bot] Monitoring target whale: ${TARGET_WHALE_ADDRESS}`);

    // Listen for transaction events on Polygon via QuickNode RPC
    provider.on({ address: TARGET_WHALE_ADDRESS }, async (log) => {
        console.log(`[Signal Detected] Trade executed by whale: ${log.transactionHash}`);
        // Parse order details and forward to local market contract or Polymarket CLOB API
    });
}
```

### 1.2 Prediction Market Smart Contract

Create a simplified ERC-20 based binary market contract to process bets, mirror target transactions, and resolve outcomes.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SimplePredictionMarket {
    enum Outcome { PENDING, YES, NO }
    
    struct Market {
        string title;
        uint256 totalYesPool;
        uint256 totalNoPool;
        Outcome winningOutcome;
        bool resolved;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesBalances;
    mapping(uint256 => mapping(address => uint256)) public noBalances;
    uint256 public marketCount;

    event MarketCreated(uint256 indexed marketId, string title);
    event PositionCopied(uint256 indexed marketId, address indexed follower, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome winner);

    function createMarket(string memory title) external returns (uint256) {
        marketCount++;
        markets[marketCount] = Market(title, 0, 0, Outcome.PENDING, false);
        emit MarketCreated(marketCount, title);
        return marketCount;
    }

    function executeCopyTrade(uint256 marketId, bool isYes) external payable {
        require(!markets[marketId].resolved, "Market resolved");
        require(msg.value > 0, "Zero liquidity");

        if (isYes) {
            yesBalances[marketId][msg.sender] += msg.value;
            markets[marketId].totalYesPool += msg.value;
        } else {
            noBalances[marketId][msg.sender] += msg.value;
            markets[marketId].totalNoPool += msg.value;
        }

        emit PositionCopied(marketId, msg.sender, isYes, msg.value);
    }

    function resolveMarket(uint256 marketId, Outcome winner) external {
        require(!markets[marketId].resolved, "Already resolved");
        require(winner != Outcome.PENDING, "Invalid winner");

        markets[marketId].winningOutcome = winner;
        markets[marketId].resolved = true;

        emit MarketResolved(marketId, winner);
    }
}
```

---

## Phase 2: User UI & Dynamic Media Engine (Hours 16 – 32)

### 2.1 Single-Page React Dashboard
Build an interactive UI allowing users to:
* View real-time prediction market listings and AI confidence scores.
* Connect Web3 wallet and enter target Polymarket wallet addresses to copy.
* Control automated trading bots and view live trade history.
* Trigger resolution summaries and interactive celebratory media.

### 2.2 Google Media Synthesizer Component
Integrate Google APIs to generate dynamic summaries and dynamic visual recaps when prediction markets resolve.

```javascript
// mediaGenerator.js
async function generateMarketResolutionMedia(marketTitle, winningOutcome) {
    const prompt = `Create an engaging celebratory video summary and illustration prompt for the prediction market outcome: "${winningOutcome}" on event: "${marketTitle}". Highlight decentralization, automated copy-trading efficiency, and economic impact.`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.REACT_APP_GOOGLE_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await response.json();
        const outputText = data.candidates[0].content.parts[0].text;

        return {
            summary: outputText,
            timestamp: new Date().toISOString()
        };
    } catch (err) {
        console.error("Failed to generate media content:", err);
        return { summary: `Market resolved: ${winningOutcome} wins!`, timestamp: new Date().toISOString() };
    }
}
```

---

## Phase 3: Integration, Testing & 48-Hour MVP Polish (Hours 32 – 48)

### 3.1 End-to-End User Flow
1. **Connect Wallet:** User launches dashboard and links Web3 wallet via Polygon network.
2. **Configure Copy Target:** User inputs target whale wallet address referenced from Polymarket activity.
3. **Execute Trades:** QuickNode listener picks up whale position changes and automatically mirrors trades into the smart contract vault.
4. **Market Resolution:** Admin or oracle resolves the prediction market (`YES` / `NO`).
5. **Interactive Media Generation:** Google API generates a celebratory summary card and video recap detailing the winning trade strategy.

---

## Environment & Key Checklist

```env
# Node / React Environment Variables
PORT=3000
QUICKNODE_RPC_URL=https://your-node.polygon-mainnet.quiknode.pro/
PRIVATE_KEY=your_testnet_private_key
TARGET_WHALE_ADDRESS=0x...
REACT_APP_GOOGLE_API_KEY=your_google_api_key
```

### 48-Hour Milestone Checklist

* [ ] **Hours 0–12:** Clone and configure QuickNode Polymarket copy-bot script; deploy `SimplePredictionMarket.sol` to Polygon testnet.
* [ ] **Hours 12–24:** Wire RPC listeners to track whale wallets and verify automated trade execution.
* [ ] **Hours 24–36:** Build single-page React frontend dashboard and Web3 wallet connections.
* [ ] **Hours 36–42:** Integrate Google AI API for video/recap media synthesis upon market settlement.
* [ ] **Hours 42–48:** End-to-end integration testing, gas optimization, and MVP demo polish.