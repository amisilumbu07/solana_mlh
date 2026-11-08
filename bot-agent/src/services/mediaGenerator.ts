/**
 * Media Generator Service
 * Uses Google Gemini API to generate market summaries and media content
 */

import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { TradeSettlement, PerformanceMetrics } from "./settlementObserver";

dotenv.config();

// ============================================================================
// Interfaces & Types
// ============================================================================

export interface MediaGenerationRequest {
  marketTitle: string;
  marketId: string;
  winningOutcome: string;
  profitLoss: number;
  roi: number;
  tradeDetails: TradeSettlement;
  performanceMetrics?: PerformanceMetrics;
}

export interface GeneratedMedia {
  id: string;
  marketId: string;
  type: "SUMMARY" | "TWITTER" | "DISCORD" | "VISUAL_PROMPT";
  content: string;
  visualPrompt?: string;
  imageUrl?: string;
  generatedAt: Date;
  model: string;
}

export interface MediaPackage {
  marketId: string;
  marketTitle: string;
  summary: GeneratedMedia;
  tweets: GeneratedMedia[];
  discordMessage: GeneratedMedia;
  visualPrompt: GeneratedMedia;
  generatedAt: Date;
}

// ============================================================================
// Media Generator Service
// ============================================================================

export class MediaGenerator {
  private apiKey: string;
  private model: string = "gemini-2.5-flash";
  private mediaHistory: GeneratedMedia[] = [];
  private historyFile: string;
  private mediaStoragePath: string;

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || "";
    if (!this.apiKey) {
      console.warn("⚠️  GOOGLE_API_KEY not set - media generation disabled");
    }

    this.mediaStoragePath = path.join(
      process.cwd(),
      process.env.MEDIA_STORAGE_PATH || "media"
    );

    // Create media storage directory if it doesn't exist
    if (!fs.existsSync(this.mediaStoragePath)) {
      fs.mkdirSync(this.mediaStoragePath, { recursive: true });
    }

    this.historyFile = path.join(
      this.mediaStoragePath,
      "media_history.json"
    );

    // Load history
    this.loadHistoryFromFile();

    console.log("✅ MediaGenerator initialized");
    console.log(`   API: Google Gemini ${this.model}`);
    console.log(`   Storage: ${this.mediaStoragePath}`);
    console.log(`   History: ${this.mediaHistory.length} items`);
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Generate complete media package for a market resolution
   */
  async generateMediaPackage(
    request: MediaGenerationRequest
  ): Promise<MediaPackage> {
    console.log(`\n📱 Generating media package for: ${request.marketTitle}`);

    try {
      const summary = await this.generateSummary(
        request.marketTitle,
        request.winningOutcome,
        request.roi,
        request.profitLoss
      );

      const tweets = await this.generateTwitterPosts(
        request.marketTitle,
        request.winningOutcome,
        request.roi
      );

      const discordMessage = await this.generateDiscordMessage(
        request.marketTitle,
        request.profitLoss,
        request.roi,
        request.performanceMetrics
      );

      const visualPrompt = await this.generateVisualPrompt(
        request.marketTitle,
        request.winningOutcome,
        request.roi
      );

      const mediaPackage: MediaPackage = {
        marketId: request.marketId,
        marketTitle: request.marketTitle,
        summary,
        tweets,
        discordMessage,
        visualPrompt,
        generatedAt: new Date(),
      };

      console.log(`✅ Media package generated`);
      console.log(`   - Summary: ${summary.content.length} chars`);
      console.log(`   - Tweets: ${tweets.length}`);
      console.log(`   - Discord: ${discordMessage.content.length} chars`);
      console.log(`   - Visual: ${visualPrompt.content.length} chars`);

      return mediaPackage;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Media generation failed: ${errorMsg}`);

      // Return fallback package
      return this.generateFallbackPackage(request);
    }
  }

  /**
   * Generate market summary narrative
   */
  async generateSummary(
    marketTitle: string,
    outcome: string,
    roi: number,
    profitLoss: number
  ): Promise<GeneratedMedia> {
    const prompt = `
    Write a concise, engaging market resolution summary (2-3 paragraphs) for a prediction market.
    
    Market: ${marketTitle}
    Outcome: ${outcome} wins
    Profit/Loss: $${profitLoss.toFixed(2)}
    ROI: ${roi.toFixed(1)}%
    
    Tone: Professional but celebratory (if profit) or analytical (if loss).
    Focus on: Market dynamics, decision reasoning, and outcome significance.
    `;

    return this.callGeminiAndStoreMedia(
      prompt,
      "SUMMARY",
      marketTitle
    );
  }

  /**
   * Generate Twitter posts (multiple options)
   */
  async generateTwitterPosts(
    marketTitle: string,
    outcome: string,
    roi: number
  ): Promise<GeneratedMedia[]> {
    const prompt = `
    Generate 3 different Twitter posts (280 characters max each) celebrating or analyzing a prediction market outcome.
    
    Market: ${marketTitle}
    Outcome: ${outcome}
    ROI: ${roi.toFixed(1)}%
    
    Posts should be:
    1. Celebratory (if profitable)
    2. Educational (explaining the outcome)
    3. Call-to-action (engaging followers)
    
    Format as:
    TWEET 1: [content]
    TWEET 2: [content]
    TWEET 3: [content]
    `;

    try {
      const response = await this.callGemini(prompt);
      const tweets = this.parseTweets(response);

      const mediaItems: GeneratedMedia[] = [];
      for (let i = 0; i < tweets.length; i++) {
        const media: GeneratedMedia = {
          id: `twitter-${Date.now()}-${i}`,
          marketId: marketTitle,
          type: "TWITTER",
          content: tweets[i],
          generatedAt: new Date(),
          model: this.model,
        };

        this.mediaHistory.push(media);
        mediaItems.push(media);
      }

      console.log(`   ✓ Generated ${tweets.length} tweets`);
      return mediaItems;
    } catch (error) {
      console.warn("⚠️  Failed to generate tweets");
      return [];
    }
  }

  /**
   * Generate Discord message
   */
  async generateDiscordMessage(
    marketTitle: string,
    profitLoss: number,
    roi: number,
    metrics?: PerformanceMetrics
  ): Promise<GeneratedMedia> {
    const metricsText = metrics
      ? `
    Total Trades: ${metrics.totalTrades}
    Win Rate: ${(metrics.winRate * 100).toFixed(1)}%
    Net Profit: $${metrics.netProfit.toFixed(2)}
    Portfolio ROI: ${metrics.roi.toFixed(1)}%
    `
      : "";

    const prompt = `
    Create a Discord announcement message for a prediction market resolution.
    
    Market: ${marketTitle}
    Result: ${profitLoss > 0 ? "PROFITABLE" : "LOSS"}
    P&L: $${profitLoss.toFixed(2)}
    ROI: ${roi.toFixed(1)}%
    
    Portfolio Metrics:${metricsText}
    
    Include:
    - Market outcome
    - P&L breakdown
    - Key statistics
    - Emoji reactions
    - Call to action
    `;

    return this.callGeminiAndStoreMedia(
      prompt,
      "DISCORD",
      marketTitle
    );
  }

  /**
   * Generate visual asset prompt for image generation tools
   */
  async generateVisualPrompt(
    marketTitle: string,
    outcome: string,
    roi: number
  ): Promise<GeneratedMedia> {
    const prompt = `
    Create a detailed prompt for an AI image generator to create a celebratory or analytical visual for a prediction market outcome.
    
    Market: ${marketTitle}
    Outcome: ${outcome}
    ROI: ${roi.toFixed(1)}%
    
    The visual should:
    - Be modern and professional
    - Include market outcome indication
    - Show profit/loss visualization (if applicable)
    - Use relevant market/finance imagery
    - Have a dynamic, engaging composition
    
    Generate a prompt that would work with DALL-E, Midjourney, or similar tools.
    Keep it under 150 words but detailed.
    `;

    return this.callGeminiAndStoreMedia(
      prompt,
      "VISUAL_PROMPT",
      marketTitle
    );
  }

  /**
   * Get media history
   */
  getMediaHistory(marketId?: string): GeneratedMedia[] {
    if (marketId) {
      return this.mediaHistory.filter((m) => m.marketId === marketId);
    }
    return this.mediaHistory;
  }

  /**
   * Get media by type
   */
  getMediaByType(type: string): GeneratedMedia[] {
    return this.mediaHistory.filter((m) => m.type === type);
  }

  /**
   * Save media to file
   */
  async saveMediaToFile(media: GeneratedMedia): Promise<string> {
    try {
      const filename = `${media.type.toLowerCase()}-${Date.now()}.md`;
      const filepath = path.join(this.mediaStoragePath, filename);

      const content = `# ${media.type} - ${media.marketId}

Generated: ${media.generatedAt.toISOString()}
Model: ${media.model}

---

${media.content}

${media.visualPrompt ? `\n## Visual Prompt\n\n${media.visualPrompt}` : ""}
`;

      fs.writeFileSync(filepath, content);
      console.log(`   💾 Saved to ${filepath}`);

      return filepath;
    } catch (error) {
      console.error("Failed to save media file", error);
      return "";
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Call Google Gemini API
   */
  private async callGemini(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Google API key not configured");
    }

    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        },
        {
          timeout: 30000,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      ) {
        return response.data.candidates[0].content.parts[0].text;
      }

      throw new Error("Invalid response format from Gemini API");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Gemini API error: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Call Gemini and store result in media history
   */
  private async callGeminiAndStoreMedia(
    prompt: string,
    type: "SUMMARY" | "DISCORD" | "VISUAL_PROMPT",
    marketId: string
  ): Promise<GeneratedMedia> {
    const content = await this.callGemini(prompt);

    const media: GeneratedMedia = {
      id: `${type.toLowerCase()}-${Date.now()}`,
      marketId,
      type,
      content,
      generatedAt: new Date(),
      model: this.model,
    };

    this.mediaHistory.push(media);
    this.saveHistoryToFile();

    return media;
  }

  /**
   * Parse tweets from response
   */
  private parseTweets(response: string): string[] {
    const tweets: string[] = [];

    // Extract tweets matching pattern "TWEET n: [content]"
    const lines = response.split("\n");
    for (const line of lines) {
      const match = line.match(/TWEET\s+\d+:\s*(.+)/i);
      if (match) {
        tweets.push(match[1].trim());
      }
    }

    // If no matches, split by newlines and filter
    if (tweets.length === 0) {
      const allLines = response
        .split("\n")
        .filter((line) => line.trim().length > 20 && line.trim().length < 280);
      return allLines.slice(0, 3);
    }

    return tweets.slice(0, 3);
  }

  /**
   * Generate fallback package if API fails
   */
  private generateFallbackPackage(
    request: MediaGenerationRequest
  ): MediaPackage {
    const summary: GeneratedMedia = {
      id: `summary-fallback-${Date.now()}`,
      marketId: request.marketId,
      type: "SUMMARY",
      content: `Market Resolution: ${request.marketTitle}
      
The market has resolved with ${request.winningOutcome} winning. Position ${request.profitLoss >= 0 ? "profited" : "lost"} $${Math.abs(request.profitLoss).toFixed(2)} (${request.roi.toFixed(1)}% ROI).`,
      generatedAt: new Date(),
      model: "fallback",
    };

    const tweets: GeneratedMedia[] = [
      {
        id: `tweet-fallback-1-${Date.now()}`,
        marketId: request.marketId,
        type: "TWITTER",
        content: `🎯 Market resolved: ${request.marketTitle} → ${request.winningOutcome}! ${request.profitLoss >= 0 ? "🎉" : "📊"} ROI: ${request.roi.toFixed(1)}%`,
        generatedAt: new Date(),
        model: "fallback",
      },
    ];

    const discord: GeneratedMedia = {
      id: `discord-fallback-${Date.now()}`,
      marketId: request.marketId,
      type: "DISCORD",
      content: `📊 **Market Resolution**\n\n**Market:** ${request.marketTitle}\n**Outcome:** ${request.winningOutcome}\n**P&L:** $${request.profitLoss.toFixed(2)}\n**ROI:** ${request.roi.toFixed(1)}%`,
      generatedAt: new Date(),
      model: "fallback",
    };

    const visual: GeneratedMedia = {
      id: `visual-fallback-${Date.now()}`,
      marketId: request.marketId,
      type: "VISUAL_PROMPT",
      content: `Modern financial market resolution visualization with ${request.winningOutcome} outcome highlighted, profit/loss indicator, professional color scheme`,
      generatedAt: new Date(),
      model: "fallback",
    };

    return {
      marketId: request.marketId,
      marketTitle: request.marketTitle,
      summary,
      tweets,
      discordMessage: discord,
      visualPrompt: visual,
      generatedAt: new Date(),
    };
  }

  // ============================================================================
  // File Persistence
  // ============================================================================

  /**
   * Save media history to file
   */
  private saveHistoryToFile(): void {
    try {
      const data = {
        lastUpdated: new Date().toISOString(),
        count: this.mediaHistory.length,
        media: this.mediaHistory,
      };

      fs.writeFileSync(this.historyFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to save media history", error);
    }
  }

  /**
   * Load media history from file
   */
  private loadHistoryFromFile(): void {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = JSON.parse(fs.readFileSync(this.historyFile, "utf-8"));

        if (data.media && Array.isArray(data.media)) {
          this.mediaHistory = data.media.map((m: any) => ({
            ...m,
            generatedAt: new Date(m.generatedAt),
          }));
        }
      }
    } catch (error) {
      console.warn("Failed to load media history", error);
    }
  }

  /**
   * Clear old media
   */
  clearOldMedia(daysOld: number = 30): void {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const before = this.mediaHistory.length;

    this.mediaHistory = this.mediaHistory.filter(
      (m) => m.generatedAt.getTime() > cutoff
    );

    const removed = before - this.mediaHistory.length;
    console.log(`🗑️  Removed ${removed} media items older than ${daysOld} days`);

    this.saveHistoryToFile();
  }

  /**
   * Export media history as JSON
   */
  exportAsJSON(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: this.mediaHistory.length,
        media: this.mediaHistory,
      },
      null,
      2
    );
  }
}

export default MediaGenerator;
