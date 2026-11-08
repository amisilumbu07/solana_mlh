/**
 * Transaction Manager Service
 * Tracks pending transactions, confirms completion, handles retries
 * Maintains transaction history and calculates fees
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ============================================================================
// Interfaces & Types
// ============================================================================

export interface PendingTransaction {
  transactionHash: string;
  marketId: string;
  walletAddress: string;
  positionSize: number;
  signalId: string;
  sentAt: Date;
  gasPrice: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  confirmationCount: number;
  attempts: number;
  lastChecked?: Date;
  blockNumber?: number;
  error?: string;
}

export interface ConfirmationStatus {
  blockNumber?: number;
  confirmationCount: number;
  gasUsed?: string;
  gasPrice: string;
  totalCost: string;
  confirmedAt?: Date;
  nonce?: number;
}

export interface TransactionHistory {
  id: string;
  hash: string;
  marketId: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  positionSize: number;
  executionPrice?: number;
  gasPrice: string;
  gasUsed?: string;
  totalCost: string;
  timestamp: Date;
  confirmedAt?: Date;
  blockNumber?: number;
  profitLoss?: number;
  error?: string;
}

// ============================================================================
// Transaction Manager Service
// ============================================================================

export class TransactionManager {
  private provider: ethers.JsonRpcProvider;
  private pendingTransactions: Map<string, PendingTransaction> = new Map();
  private transactionHistory: TransactionHistory[] = [];
  private historyFile: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private confirmationTargets: number[] = [1, 3, 6, 12]; // Track these confirmation counts
  private callbacks: {
    onConfirmed?: (tx: TransactionHistory) => void;
    onFailed?: (tx: TransactionHistory) => void;
  } = {};

  constructor() {
    const rpcUrl = process.env.POLYGON_AMOY_RPC;
    if (!rpcUrl) {
      throw new Error("POLYGON_AMOY_RPC not set in environment");
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.historyFile = path.join(
      process.cwd(),
      "transaction_history.json"
    );

    // Load history from file
    this.loadHistoryFromFile();

    console.log("✅ TransactionManager initialized");
    console.log(`   History file: ${this.historyFile}`);
    console.log(`   Loaded ${this.transactionHistory.length} historical transactions`);
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Track a new transaction
   */
  trackTransaction(
    hash: string,
    marketId: string,
    walletAddress: string,
    positionSize: number,
    gasPrice: string,
    signalId: string = ""
  ): PendingTransaction {
    const tx: PendingTransaction = {
      transactionHash: hash,
      marketId,
      walletAddress,
      positionSize,
      signalId,
      sentAt: new Date(),
      gasPrice,
      status: "PENDING",
      confirmationCount: 0,
      attempts: 1,
    };

    this.pendingTransactions.set(hash, tx);

    console.log(`📝 Tracking transaction: ${hash.slice(0, 10)}...`);
    console.log(`   Market: ${marketId}`);
    console.log(`   Position: $${positionSize.toFixed(2)}`);

    // Auto-save to file
    this.saveHistoryToFile();

    return tx;
  }

  /**
   * Start polling for confirmations
   */
  startPolling(interval: number = 5000): void {
    if (this.pollInterval) {
      console.warn("⚠️  Polling already active");
      return;
    }

    console.log(`🔄 Starting confirmation polling (${interval}ms intervals)`);

    this.pollInterval = setInterval(async () => {
      await this.pollConfirmations();
    }, interval);
  }

  /**
   * Stop polling for confirmations
   */
  stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log("⏹️  Polling stopped");
    }
  }

  /**
   * Poll for confirmations on pending transactions
   */
  async pollConfirmations(): Promise<void> {
    const pending = Array.from(this.pendingTransactions.values()).filter(
      (tx) => tx.status === "PENDING"
    );

    if (pending.length === 0) {
      return;
    }

    for (const tx of pending) {
      try {
        const receipt = await this.provider.getTransactionReceipt(
          tx.transactionHash
        );

        if (receipt) {
          // Transaction is in a block
          const currentBlock = await this.provider.getBlockNumber();
          const confirmations = currentBlock - receipt.blockNumber;

          tx.confirmationCount = confirmations;
          tx.blockNumber = receipt.blockNumber;
          tx.lastChecked = new Date();

          // Check if sufficient confirmations
          if (confirmations >= 1) {
            tx.status = "CONFIRMED";
            await this.onTransactionConfirmed(tx, receipt);

            console.log(
              `✅ Transaction confirmed: ${tx.transactionHash.slice(0, 10)}... (${confirmations} confirmations)`
            );
          }
        } else {
          // Still pending, increment attempts
          tx.attempts++;
          tx.lastChecked = new Date();

          // Check for stuck transactions (>20 attempts)
          if (tx.attempts > 20) {
            tx.status = "FAILED";
            tx.error = "Transaction stuck - max attempts exceeded";
            await this.onTransactionFailed(tx);

            console.error(
              `❌ Transaction failed: ${tx.transactionHash.slice(0, 10)}... (stuck)`
            );
          }
        }
      } catch (error) {
        console.error(
          `⚠️  Error polling tx ${tx.transactionHash.slice(0, 10)}...`,
          error
        );
        tx.attempts++;
        tx.lastChecked = new Date();
      }
    }

    // Save updates
    this.saveHistoryToFile();
  }

  /**
   * Get transaction status
   */
  getTransactionStatus(hash: string): PendingTransaction | null {
    return this.pendingTransactions.get(hash) || null;
  }

  /**
   * Get all pending transactions
   */
  getPendingTransactions(): PendingTransaction[] {
    return Array.from(this.pendingTransactions.values()).filter(
      (tx) => tx.status === "PENDING"
    );
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(limit: number = 100): TransactionHistory[] {
    return this.transactionHistory.slice(-limit);
  }

  /**
   * Get history by market ID
   */
  getHistoryByMarket(marketId: string): TransactionHistory[] {
    return this.transactionHistory.filter((tx) => tx.marketId === marketId);
  }

  /**
   * Get confirmation status for a transaction
   */
  async getConfirmationStatus(hash: string): Promise<ConfirmationStatus | null> {
    try {
      const receipt = await this.provider.getTransactionReceipt(hash);

      if (!receipt) {
        return null;
      }

      const tx = await this.provider.getTransaction(hash);
      if (!tx) {
        return null;
      }

      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;

      // Calculate costs
      const gasUsed = receipt.gasUsed.toString();
      const gasPrice = tx.gasPrice?.toString() || "0";
      const totalCost = (BigInt(gasUsed) * BigInt(gasPrice)).toString();

      return {
        blockNumber: receipt.blockNumber,
        confirmationCount: confirmations,
        gasUsed: gasUsed,
        gasPrice: ethers.formatUnits(gasPrice, "gwei"),
        totalCost: ethers.formatEther(totalCost),
        confirmedAt: new Date(),
        nonce: tx.nonce,
      };
    } catch (error) {
      console.error("Failed to get confirmation status");
      return null;
    }
  }

  /**
   * Calculate total execution costs
   */
  calculateExecutionCost(tx: TransactionHistory): string {
    if (!tx.gasUsed || !tx.gasPrice) {
      return "0";
    }

    const gasUsedBN = BigInt(tx.gasUsed);
    const gasPriceBN = ethers.parseUnits(tx.gasPrice, "gwei");
    const totalCost = gasUsedBN * gasPriceBN;

    return ethers.formatEther(totalCost);
  }

  /**
   * Get transaction statistics
   */
  getStatistics() {
    const all = this.transactionHistory;
    const confirmed = all.filter((tx) => tx.status === "CONFIRMED");
    const failed = all.filter((tx) => tx.status === "FAILED");
    const pending = this.getPendingTransactions();

    const totalCost = confirmed.reduce(
      (sum, tx) => sum + parseFloat(tx.totalCost || "0"),
      0
    );

    const avgGasPrice =
      confirmed.length > 0
        ? confirmed.reduce(
            (sum, tx) => sum + parseFloat(tx.gasPrice || "0"),
            0
          ) / confirmed.length
        : 0;

    return {
      total: all.length,
      confirmed: confirmed.length,
      failed: failed.length,
      pending: pending.length,
      successRate:
        all.length > 0 ? ((confirmed.length / all.length) * 100).toFixed(1) : "0",
      totalPositionSize: all.reduce((sum, tx) => sum + tx.positionSize, 0),
      totalGasCost: totalCost.toFixed(4),
      averageGasPrice: avgGasPrice.toFixed(2),
    };
  }

  /**
   * Register callback for confirmed transactions
   */
  onConfirmed(callback: (tx: TransactionHistory) => void): void {
    this.callbacks.onConfirmed = callback;
  }

  /**
   * Register callback for failed transactions
   */
  onFailed(callback: (tx: TransactionHistory) => void): void {
    this.callbacks.onFailed = callback;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Handle transaction confirmation
   */
  private async onTransactionConfirmed(
    pendingTx: PendingTransaction,
    receipt: ethers.TransactionReceipt
  ): Promise<void> {
    // Get full transaction data
    const tx = await this.provider.getTransaction(
      pendingTx.transactionHash
    );

    const historyItem: TransactionHistory = {
      id: `${pendingTx.transactionHash.slice(0, 10)}-${Date.now()}`,
      hash: pendingTx.transactionHash,
      marketId: pendingTx.marketId,
      status: "CONFIRMED",
      positionSize: pendingTx.positionSize,
      gasPrice: ethers.formatUnits(tx?.gasPrice || 0, "gwei"),
      gasUsed: receipt.gasUsed.toString(),
      totalCost: ethers.formatEther(
        BigInt(receipt.gasUsed) * BigInt(tx?.gasPrice || 0)
      ),
      timestamp: new Date(),
      confirmedAt: new Date(),
      blockNumber: receipt.blockNumber,
    };

    this.transactionHistory.push(historyItem);
    this.saveHistoryToFile();

    // Trigger callback
    if (this.callbacks.onConfirmed) {
      this.callbacks.onConfirmed(historyItem);
    }
  }

  /**
   * Handle transaction failure
   */
  private async onTransactionFailed(
    pendingTx: PendingTransaction
  ): Promise<void> {
    const historyItem: TransactionHistory = {
      id: `${pendingTx.transactionHash.slice(0, 10)}-${Date.now()}`,
      hash: pendingTx.transactionHash,
      marketId: pendingTx.marketId,
      status: "FAILED",
      positionSize: pendingTx.positionSize,
      gasPrice: pendingTx.gasPrice,
      totalCost: "0",
      timestamp: pendingTx.sentAt,
      error: pendingTx.error,
    };

    this.transactionHistory.push(historyItem);
    this.saveHistoryToFile();

    // Trigger callback
    if (this.callbacks.onFailed) {
      this.callbacks.onFailed(historyItem);
    }
  }

  // ============================================================================
  // File Persistence
  // ============================================================================

  /**
   * Save transaction history to file
   */
  private saveHistoryToFile(): void {
    try {
      const data = {
        lastUpdated: new Date().toISOString(),
        pending: Array.from(this.pendingTransactions.values()),
        history: this.transactionHistory,
      };

      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to save transaction history", error);
    }
  }

  /**
   * Load transaction history from file
   */
  private loadHistoryFromFile(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, "utf-8"));

        // Load history
        if (data.history && Array.isArray(data.history)) {
          this.transactionHistory = data.history.map((tx: any) => ({
            ...tx,
            timestamp: new Date(tx.timestamp),
            confirmedAt: tx.confirmedAt ? new Date(tx.confirmedAt) : undefined,
          }));
        }

        // Load pending (only recent ones)
        if (data.pending && Array.isArray(data.pending)) {
          for (const tx of data.pending) {
            // Skip if already confirmed or too old (>24h)
            const age = Date.now() - new Date(tx.sentAt).getTime();
            if (age < 24 * 60 * 60 * 1000) {
              this.pendingTransactions.set(tx.transactionHash, {
                ...tx,
                sentAt: new Date(tx.sentAt),
                lastChecked: tx.lastChecked ? new Date(tx.lastChecked) : undefined,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load transaction history", error);
    }
  }

  /**
   * Export history as CSV
   */
  exportAsCSV(): string {
    const headers = [
      "Hash",
      "Market ID",
      "Status",
      "Position Size",
      "Gas Price (Gwei)",
      "Gas Used",
      "Total Cost (ETH)",
      "Timestamp",
      "Confirmed At",
      "Block Number",
      "Error",
    ];

    const rows = this.transactionHistory.map((tx) => [
      tx.hash,
      tx.marketId,
      tx.status,
      tx.positionSize.toFixed(2),
      tx.gasPrice,
      tx.gasUsed || "",
      tx.totalCost,
      tx.timestamp.toISOString(),
      tx.confirmedAt?.toISOString() || "",
      tx.blockNumber?.toString() || "",
      tx.error || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csv;
  }

  /**
   * Clear old transactions (older than X days)
   */
  clearOldTransactions(daysOld: number = 30): void {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const before = this.transactionHistory.length;

    this.transactionHistory = this.transactionHistory.filter(
      (tx) => tx.timestamp.getTime() > cutoff
    );

    const removed = before - this.transactionHistory.length;
    console.log(`🗑️  Removed ${removed} transactions older than ${daysOld} days`);

    this.saveHistoryToFile();
  }
}

export default TransactionManager;
