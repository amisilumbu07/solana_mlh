/**
 * Trade Executor Service
 * Converts AI signals into blockchain transactions on Polygon
 * Handles position sizing, validation, and execution
 */

import { ethers } from "ethers";
import axios from "axios";
import * as dotenv from "dotenv";

dotenv.config();

// ============================================================================
// Interfaces & Types
// ============================================================================

export interface TradeSignal {
  marketId: string;
  action: "BUY" | "SELL" | "HOLD";
  position: "YES" | "NO";
  confidence: number; // 0-1
  riskScore: number; // 0-1
  reasoning: string;
  recommendation: "EXECUTE" | "REVIEW" | "SKIP";
  positionSizeOverride?: number;
  timestamp?: string;
}

export interface ExecutionConfig {
  maxPositionSize: number; // Max USD per trade
  kellyFraction: number; // 0.25 = quarter kelly
  gasLimit: number;
  gasPrice?: bigint; // Auto if not set
  maxSlippage: number; // 5%
  minConfidenceForExecution: number; // 0.60
  bankroll: number; // Total capital for kelly calculation
}

export interface ExecutionResult {
  transactionHash: string;
  marketId: string;
  positionSize: number;
  executionPrice?: number;
  gasPrice?: string;
  gasEstimate?: string;
  gasUsed?: string;
  timestamp: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  error?: string;
  blockNumber?: number;
}

interface MarketData {
  yes_price: number;
  no_price: number;
  volume_24h: number;
  liquidity: number;
}

// ============================================================================
// Trade Executor Service
// ============================================================================

export class TradeExecutor {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private config: ExecutionConfig;
  private contractABI: any[];
  private contractAddress: string;
  private executionHistory: ExecutionResult[] = [];

  constructor(config: Partial<ExecutionConfig> = {}) {
    // Initialize provider
    const rpcUrl = process.env.POLYGON_AMOY_RPC;
    if (!rpcUrl) {
      throw new Error("POLYGON_AMOY_RPC not set in environment");
    }
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Initialize signer (wallet)
    const privateKey = process.env.POLYGON_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("POLYGON_WALLET_PRIVATE_KEY not set in environment");
    }
    this.signer = new ethers.Wallet(privateKey, this.provider);

    // Initialize contract
    this.contractAddress = process.env.MARKET_CONTRACT_ADDRESS || "";
    this.contractABI = this.getContractABI();

    // Merge config with defaults
    this.config = {
      maxPositionSize: 1000,
      kellyFraction: 0.25,
      gasLimit: 300000,
      maxSlippage: 5,
      minConfidenceForExecution: 0.6,
      bankroll: 10000,
      ...config,
    };

    console.log("✅ TradeExecutor initialized");
    console.log(`   Wallet: ${this.signer.address}`);
    console.log(`   Network: Polygon Amoy`);
    console.log(`   Config:`, this.config);
  }

  // ============================================================================
  // Main Execution Flow
  // ============================================================================

  /**
   * Execute a trade signal
   * Validates → Sizes → Builds → Submits
   */
  async executeSignal(signal: TradeSignal): Promise<ExecutionResult> {
    try {
      console.log("\n🚀 Executing trade signal:");
      console.log(`   Market: ${signal.marketId}`);
      console.log(`   Action: ${signal.action} ${signal.position}`);
      console.log(`   Confidence: ${(signal.confidence * 100).toFixed(1)}%`);

      // 1. Validate signal
      if (!this.validateSignal(signal)) {
        throw new Error("Signal validation failed");
      }

      // 2. Check execution criteria
      if (signal.recommendation === "SKIP") {
        throw new Error("Signal marked as SKIP");
      }

      if (
        signal.recommendation === "REVIEW" &&
        signal.confidence < this.config.minConfidenceForExecution
      ) {
        throw new Error(
          `Confidence ${signal.confidence} below minimum ${this.config.minConfidenceForExecution}`
        );
      }

      // 3. Calculate position size
      const positionSize =
        signal.positionSizeOverride ||
        this.calculatePositionSize(signal, this.config.bankroll);
      console.log(`   Position Size: $${positionSize.toFixed(2)}`);

      // 4. Get market data for price
      const marketData = await this.getMarketData(signal.marketId);
      const executionPrice =
        signal.position === "YES"
          ? marketData.yes_price
          : marketData.no_price;
      console.log(`   Execution Price: ${executionPrice.toFixed(4)}`);

      // 5. Build transaction
      const tx = await this.buildTransaction(signal, positionSize);
      console.log(`   Transaction built`);

      // 6. Execute transaction
      const result = await this.submitTransaction(tx, signal, positionSize, executionPrice);

      // 7. Log execution
      this.executionHistory.push(result);
      this.logExecution(result);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Execution failed: ${errorMsg}`);

      const result: ExecutionResult = {
        transactionHash: "",
        marketId: signal.marketId,
        positionSize: 0,
        timestamp: new Date().toISOString(),
        status: "FAILED",
        error: errorMsg,
      };

      this.executionHistory.push(result);
      return result;
    }
  }

  // ============================================================================
  // Position Sizing (Kelly Criterion)
  // ============================================================================

  /**
   * Calculate position size using Kelly Criterion
   * f* = (bp - q) / b
   * f* = (confidence * odds - (1 - confidence)) / odds
   * Then apply kelly fraction (usually 0.25 for safety)
   */
  calculatePositionSize(signal: TradeSignal, bankroll: number): number {
    const { confidence } = signal;
    const odds = 1; // Binary market: 50/50 odds

    // Kelly formula: f = (p*b - q) / b
    // For binary: f = 2*p - 1
    const kellyFraction = 2 * confidence - 1;

    // Apply safety fraction (e.g., 0.25 = quarter kelly)
    const safeKelly = kellyFraction * this.config.kellyFraction;

    // Calculate position size
    let positionSize = bankroll * Math.max(0, safeKelly);

    // Apply caps
    positionSize = Math.min(
      positionSize,
      this.config.maxPositionSize
    );

    // Minimum position size
    positionSize = Math.max(positionSize, 10); // $10 minimum

    return positionSize;
  }

  // ============================================================================
  // Transaction Building & Submission
  // ============================================================================

  /**
   * Build transaction to smart contract
   */
  async buildTransaction(
    signal: TradeSignal,
    amount: number
  ): Promise<ethers.ContractTransactionResponse | null> {
    try {
      // Get contract
      const contract = new ethers.Contract(
        this.contractAddress,
        this.contractABI,
        this.signer
      );

      // Convert amount to Wei
      const amountWei = ethers.parseEther(amount.toFixed(18));

      // Determine if YES or NO position
      const isYes = signal.position === "YES";

      // Check wallet balance
      const balance = await this.provider.getBalance(this.signer.address);
      if (balance < amountWei) {
        throw new Error(
          `Insufficient balance: ${ethers.formatEther(balance)} < ${amount}`
        );
      }

      // Build transaction call
      const txData = contract.interface.encodeFunctionData(
        "executeCopyTrade",
        [signal.marketId, isYes]
      );

      console.log(`   Transaction data encoded`);

      return null; // Will be submitted separately
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to build transaction: ${errorMsg}`);
    }
  }

  /**
   * Submit transaction to blockchain
   */
  private async submitTransaction(
    tx: any,
    signal: TradeSignal,
    positionSize: number,
    executionPrice: number
  ): Promise<ExecutionResult> {
    try {
      // Get current gas price
      const gasPrice = await this.getOptimizedGasPrice();
      console.log(`   Gas Price: ${ethers.formatUnits(gasPrice, "gwei")} Gwei`);

      // Create contract instance
      const contract = new ethers.Contract(
        this.contractAddress,
        this.contractABI,
        this.signer
      );

      // Send transaction
      const isYes = signal.position === "YES";
      const amountWei = ethers.parseEther(positionSize.toString());

      console.log(`   Submitting to chain...`);

      const txResponse = await contract.executeCopyTrade(
        signal.marketId,
        isYes,
        {
          value: amountWei,
          gasLimit: this.config.gasLimit,
          gasPrice: gasPrice,
        }
      );

      console.log(`   ✅ TX submitted: ${txResponse.hash}`);

      // Wait for confirmation
      const receipt = await txResponse.wait(1);

      const result: ExecutionResult = {
        transactionHash: txResponse.hash,
        marketId: signal.marketId,
        positionSize,
        executionPrice,
        gasPrice: ethers.formatUnits(gasPrice, "gwei"),
        gasEstimate: this.config.gasLimit.toString(),
        gasUsed: receipt?.gasUsed?.toString(),
        timestamp: new Date().toISOString(),
        status: "CONFIRMED",
        blockNumber: receipt?.blockNumber,
      };

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to submit transaction: ${errorMsg}`);
    }
  }

  // ============================================================================
  // Gas & Price Optimization
  // ============================================================================

  /**
   * Get optimized gas price
   * Uses current network price with optional buffer
   */
  private async getOptimizedGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      if (!feeData.gasPrice) {
        throw new Error("Unable to fetch gas price");
      }

      // Add 10% buffer for faster confirmation
      const optimizedPrice = (feeData.gasPrice * BigInt(110)) / 100n;

      return optimizedPrice;
    } catch (error) {
      console.warn("⚠️  Using default gas price");
      return ethers.parseUnits("50", "gwei");
    }
  }

  // ============================================================================
  // Market Data Fetching
  // ============================================================================

  /**
   * Fetch current market data from Polymarket CLOB API
   */
  private async getMarketData(marketId: string): Promise<MarketData> {
    try {
      const response = await axios.get(
        `https://clob.polymarket.com/markets?market_slug=${marketId}`
      );

      const market = response.data[0];
      if (!market) {
        throw new Error(`Market not found: ${marketId}`);
      }

      return {
        yes_price: parseFloat(market.best_bid_yes || 0.5),
        no_price: parseFloat(market.best_bid_no || 0.5),
        volume_24h: market.volume_24h || 0,
        liquidity: market.liquidity || 0,
      };
    } catch (error) {
      console.warn("⚠️  Using default market data");
      return {
        yes_price: 0.5,
        no_price: 0.5,
        volume_24h: 0,
        liquidity: 0,
      };
    }
  }

  // ============================================================================
  // Validation & Logging
  // ============================================================================

  /**
   * Validate signal before execution
   */
  validateSignal(signal: TradeSignal): boolean {
    // Check required fields
    if (!signal.marketId || !signal.action || !signal.position) {
      console.error("Missing required signal fields");
      return false;
    }

    // Check confidence range
    if (signal.confidence < 0 || signal.confidence > 1) {
      console.error("Invalid confidence score");
      return false;
    }

    // Check action validity
    if (!["BUY", "SELL", "HOLD"].includes(signal.action)) {
      console.error("Invalid action");
      return false;
    }

    // Check position validity
    if (!["YES", "NO"].includes(signal.position)) {
      console.error("Invalid position");
      return false;
    }

    // Don't execute HOLD signals
    if (signal.action === "HOLD") {
      console.warn("⚠️  HOLD signal - skipping execution");
      return false;
    }

    return true;
  }

  /**
   * Log execution result
   */
  private logExecution(result: ExecutionResult): void {
    const status = result.status === "CONFIRMED" ? "✅" : "❌";
    console.log(`\n${status} Execution Logged:`);
    console.log(`   Market: ${result.marketId}`);
    console.log(`   Position Size: $${result.positionSize.toFixed(2)}`);
    console.log(`   Status: ${result.status}`);
    if (result.transactionHash) {
      console.log(
        `   TX: ${result.transactionHash.slice(0, 10)}...${result.transactionHash.slice(-8)}`
      );
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  // ============================================================================
  // Public Accessors
  // ============================================================================

  /**
   * Get execution history
   */
  getExecutionHistory(limit: number = 50): ExecutionResult[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get execution stats
   */
  getExecutionStats() {
    const total = this.executionHistory.length;
    const confirmed = this.executionHistory.filter(
      (e) => e.status === "CONFIRMED"
    ).length;
    const failed = this.executionHistory.filter(
      (e) => e.status === "FAILED"
    ).length;

    return {
      total,
      confirmed,
      failed,
      successRate: total > 0 ? ((confirmed / total) * 100).toFixed(1) : "0",
      totalVolume: this.executionHistory.reduce((sum, e) => sum + e.positionSize, 0),
    };
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(): Promise<string> {
    try {
      const balance = await this.provider.getBalance(this.signer.address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error("Failed to fetch balance");
      return "0";
    }
  }

  /**
   * Get contract ABI
   */
  private getContractABI(): any[] {
    return [
      {
        inputs: [
          { name: "marketId", type: "string" },
          { name: "isYesPosition", type: "bool" },
        ],
        name: "executeCopyTrade",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
      {
        inputs: [
          { name: "marketId", type: "string" },
          { name: "yesWins", type: "bool" },
        ],
        name: "resolveMarket",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
      {
        inputs: [],
        name: "claimWinnings",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ];
  }
}

export default TradeExecutor;
