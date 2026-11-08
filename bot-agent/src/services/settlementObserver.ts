/**
 * Settlement Observer Service
 * Monitors market resolutions, calculates P&L, triggers media generation
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ============================================================================
// Interfaces & Types
// ============================================================================

export interface MarketResolution {
  marketId: string;
  winningOutcome: "YES" | "NO";
  resolvedAt: Date;
  finalOdds?: number;
  totalVolume?: number;
  liquidityRemoved?: number;
}

export interface TradeSettlement {
  transactionHash: string;
  marketId: string;
  position: "YES" | "NO";
  positionSize: number;
  executionPrice: number;
  winningOutcome: "YES" | "NO";
  won: boolean;
  payout: number;
  profitLoss: number;
  roi: number; // Percentage
  settledAt: Date;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // 0-1
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  roi: number; // % return
  averageProfitPerTrade: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
}

interface MarketData {
  market_id: string;
  title: string;
  outcome_price_yes: number;
  outcome_price_no: number;
  status: string;
  resolution: string;
}

// ============================================================================
// Settlement Observer Service
// ============================================================================

export class SettlementObserver {
  private settlements: TradeSettlement[] = [];
  private resolutions: MarketResolution[] = [];
  private historyFile: string;
  private monitoringActive: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private trackedMarkets: Set<string> = new Set();
  private callbacks: {
    onResolution?: (resolution: MarketResolution) => void;
    onSettlement?: (settlement: TradeSettlement) => void;
  } = {};

  constructor() {
    this.historyFile = path.join(
      process.cwd(),
      "settlement_history.json"
    );

    // Load history from file
    this.loadHistoryFromFile();

    console.log("✅ SettlementObserver initialized");
    console.log(`   History file: ${this.historyFile}`);
    console.log(`   Loaded ${this.settlements.length} settlements`);
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Start monitoring markets for resolution
   */
  startMonitoring(interval: number = 10000): void {
    if (this.monitoringActive) {
      console.warn("⚠️  Monitoring already active");
      return;
    }

    console.log(`🔄 Starting market resolution monitoring (${interval}ms intervals)`);
    this.monitoringActive = true;

    this.pollInterval = setInterval(async () => {
      await this.pollMarkets();
    }, interval);
  }

  /**
   * Stop monitoring markets
   */
  stopMonitoring(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      this.monitoringActive = false;
      console.log("⏹️  Market monitoring stopped");
    }
  }

  /**
   * Add market to tracking list
   */
  trackMarket(marketId: string): void {
    this.trackedMarkets.add(marketId);
    console.log(`📍 Now tracking market: ${marketId}`);
  }

  /**
   * Remove market from tracking
   */
  untrackMarket(marketId: string): void {
    this.trackedMarkets.delete(marketId);
  }

  /**
   * Record a trade settlement
   */
  recordSettlement(settlement: TradeSettlement): void {
    this.settlements.push(settlement);
    this.saveHistoryToFile();

    console.log(`💰 Settlement recorded:`);
    console.log(`   Market: ${settlement.marketId}`);
    console.log(`   Position: ${settlement.position}`);
    console.log(`   Result: ${settlement.won ? "✅ WIN" : "❌ LOSS"}`);
    console.log(`   P&L: $${settlement.profitLoss.toFixed(2)} (${settlement.roi.toFixed(1)}%)`);

    // Trigger callback
    if (this.callbacks.onSettlement) {
      this.callbacks.onSettlement(settlement);
    }
  }

  /**
   * Get settlement history
   */
  getSettlementHistory(limit: number = 100): TradeSettlement[] {
    return this.settlements.slice(-limit);
  }

  /**
   * Get settlements by market
   */
  getSettlementsByMarket(marketId: string): TradeSettlement[] {
    return this.settlements.filter((s) => s.marketId === marketId);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    if (this.settlements.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        netProfit: 0,
        roi: 0,
        averageProfitPerTrade: 0,
        bestTrade: 0,
        worstTrade: 0,
        consecutiveWins: 0,
        consecutiveLosses: 0,
      };
    }

    const totalTrades = this.settlements.length;
    const winningTrades = this.settlements.filter((s) => s.won).length;
    const losingTrades = totalTrades - winningTrades;

    const totalProfit = this.settlements
      .filter((s) => s.profitLoss > 0)
      .reduce((sum, s) => sum + s.profitLoss, 0);

    const totalLoss = Math.abs(
      this.settlements
        .filter((s) => s.profitLoss < 0)
        .reduce((sum, s) => sum + s.profitLoss, 0)
    );

    const netProfit = totalProfit - totalLoss;

    // Calculate streaks
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;

    for (const settlement of this.settlements) {
      if (settlement.won) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    // Find best and worst trades
    const pnlValues = this.settlements.map((s) => s.profitLoss);
    const bestTrade = Math.max(...pnlValues);
    const worstTrade = Math.min(...pnlValues);

    // Calculate ROI
    const totalInvested = this.settlements.reduce(
      (sum, s) => sum + s.positionSize,
      0
    );
    const roi = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

    // Calculate Sharpe Ratio (simplified)
    const sharpeRatio = this.calculateSharpeRatio();

    // Calculate Max Drawdown (simplified)
    const maxDrawdown = this.calculateMaxDrawdown();

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: winningTrades / totalTrades,
      totalProfit,
      totalLoss,
      netProfit,
      roi,
      averageProfitPerTrade: netProfit / totalTrades,
      bestTrade,
      worstTrade,
      consecutiveWins: maxWinStreak,
      consecutiveLosses: maxLossStreak,
      sharpeRatio,
      maxDrawdown,
    };
  }

  /**
   * Register callback for market resolution
   */
  onResolution(callback: (resolution: MarketResolution) => void): void {
    this.callbacks.onResolution = callback;
  }

  /**
   * Register callback for settlement
   */
  onSettlement(callback: (settlement: TradeSettlement) => void): void {
    this.callbacks.onSettlement = callback;
  }

  /**
   * Manually record market resolution
   */
  recordResolution(resolution: MarketResolution): void {
    this.resolutions.push(resolution);
    console.log(`✅ Market resolved: ${resolution.marketId}`);
    console.log(`   Winner: ${resolution.winningOutcome}`);

    if (this.callbacks.onResolution) {
      this.callbacks.onResolution(resolution);
    }

    this.saveHistoryToFile();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Poll Polymarket CLOB API for market resolutions
   */
  private async pollMarkets(): Promise<void> {
    if (this.trackedMarkets.size === 0) {
      return;
    }

    try {
      for (const marketId of Array.from(this.trackedMarkets)) {
        await this.checkMarketResolution(marketId);
      }
    } catch (error) {
      console.error("Error polling markets", error);
    }
  }

  /**
   * Check if a specific market has been resolved
   */
  private async checkMarketResolution(marketId: string): Promise<void> {
    try {
      const response = await axios.get(
        `https://clob.polymarket.com/markets?market_slug=${marketId}`
      );

      const market = response.data[0];
      if (!market) {
        return;
      }

      // Check if resolved
      if (market.status === "resolved" || market.resolution) {
        const winningOutcome = market.resolution === "YES" ? "YES" : "NO";

        // Check if we've already recorded this
        const alreadyRecorded = this.resolutions.some(
          (r) => r.marketId === marketId && r.winningOutcome === winningOutcome
        );

        if (!alreadyRecorded) {
          const resolution: MarketResolution = {
            marketId,
            winningOutcome,
            resolvedAt: new Date(),
            finalOdds: market.outcome_price_yes,
            totalVolume: market.volume_24h,
          };

          this.recordResolution(resolution);

          // Process settlements
          await this.processSettlementsForMarket(marketId, winningOutcome);
        }
      }
    } catch (error) {
      // Silently fail - market might not exist yet
    }
  }

  /**
   * Process all settlements for a resolved market
   */
  private async processSettlementsForMarket(
    marketId: string,
    winningOutcome: string
  ): Promise<void> {
    const marketSettlements = this.settlements.filter(
      (s) => s.marketId === marketId && !s.settledAt
    );

    for (const settlement of marketSettlements) {
      settlement.winningOutcome = winningOutcome as "YES" | "NO";
      settlement.won = settlement.position === winningOutcome;
      settlement.settledAt = new Date();

      // Calculate payout (simplified - 2x for winners, 0x for losers)
      settlement.payout = settlement.won ? settlement.positionSize * 2 : 0;
      settlement.profitLoss = settlement.payout - settlement.positionSize;
      settlement.roi = (settlement.profitLoss / settlement.positionSize) * 100;

      console.log(`📊 Settlement processed: ${settlement.marketId}`);
      console.log(`   Won: ${settlement.won ? "✅" : "❌"}`);
      console.log(`   P&L: $${settlement.profitLoss.toFixed(2)}`);
    }

    this.saveHistoryToFile();
  }

  /**
   * Calculate Sharpe Ratio (simplified)
   */
  private calculateSharpeRatio(): number {
    if (this.settlements.length < 2) {
      return 0;
    }

    const returns = this.settlements.map((s) => s.roi);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

    const variance =
      returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      returns.length;
    const stdDev = Math.sqrt(variance);

    // Sharpe ratio = (return - riskFreeRate) / stdDev
    // Assuming 0% risk-free rate
    const sharpeRatio = stdDev > 0 ? mean / stdDev : 0;

    return parseFloat(sharpeRatio.toFixed(2));
  }

  /**
   * Calculate Maximum Drawdown (simplified)
   */
  private calculateMaxDrawdown(): number {
    if (this.settlements.length === 0) {
      return 0;
    }

    let peak = 0;
    let maxDrawdown = 0;
    let cumulativeProfit = 0;

    for (const settlement of this.settlements) {
      cumulativeProfit += settlement.profitLoss;
      peak = Math.max(peak, cumulativeProfit);

      const drawdown = ((peak - cumulativeProfit) / peak) * 100;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return parseFloat(maxDrawdown.toFixed(2));
  }

  // ============================================================================
  // File Persistence
  // ============================================================================

  /**
   * Save settlement history to file
   */
  private saveHistoryToFile(): void {
    try {
      const data = {
        lastUpdated: new Date().toISOString(),
        settlements: this.settlements,
        resolutions: this.resolutions,
        metrics: this.getPerformanceMetrics(),
      };

      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to save settlement history", error);
    }
  }

  /**
   * Load settlement history from file
   */
  private loadHistoryFromFile(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, "utf-8"));

        // Load settlements
        if (data.settlements && Array.isArray(data.settlements)) {
          this.settlements = data.settlements.map((s: any) => ({
            ...s,
            settledAt: s.settledAt ? new Date(s.settledAt) : undefined,
          }));
        }

        // Load resolutions
        if (data.resolutions && Array.isArray(data.resolutions)) {
          this.resolutions = data.resolutions.map((r: any) => ({
            ...r,
            resolvedAt: new Date(r.resolvedAt),
          }));
        }
      }
    } catch (error) {
      console.warn("Failed to load settlement history", error);
    }
  }

  /**
   * Export settlements as CSV
   */
  exportAsCSV(): string {
    const headers = [
      "TX Hash",
      "Market ID",
      "Position",
      "Position Size",
      "Entry Price",
      "Outcome",
      "Won",
      "P&L ($)",
      "ROI (%)",
      "Settled At",
    ];

    const rows = this.settlements.map((s) => [
      s.transactionHash.slice(0, 10),
      s.marketId,
      s.position,
      s.positionSize.toFixed(2),
      s.executionPrice.toFixed(4),
      s.winningOutcome,
      s.won ? "YES" : "NO",
      s.profitLoss.toFixed(2),
      s.roi.toFixed(1),
      s.settledAt?.toISOString() || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csv;
  }

  /**
   * Clear old settlements
   */
  clearOldSettlements(daysOld: number = 90): void {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const before = this.settlements.length;

    this.settlements = this.settlements.filter(
      (s) =>
        !s.settledAt ||
        s.settledAt.getTime() > cutoff
    );

    const removed = before - this.settlements.length;
    console.log(`🗑️  Removed ${removed} settlements older than ${daysOld} days`);

    this.saveHistoryToFile();
  }
}

export default SettlementObserver;
