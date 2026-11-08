// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Prediction Market Vault Contract
 * Handles binary prediction market positions (YES/NO)
 * Allows copy-trading and market resolution
 */

contract PredictionMarketVault {
    // ========================================================================
    // State Variables
    // ========================================================================

    enum Outcome {
        PENDING,
        YES,
        NO
    }

    struct Market {
        string title;
        uint256 createdAt;
        uint256 totalYesLiquidity;
        uint256 totalNoLiquidity;
        Outcome winningOutcome;
        bool resolved;
        address owner;
    }

    struct Position {
        bool isYes;
        uint256 amount;
        uint256 timestamp;
        bool claimed;
    }

    // Market storage
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;
    uint256 public marketCount = 0;

    // Owner/admin
    address public owner;
    uint256 public totalVolume = 0;

    // ========================================================================
    // Events
    // ========================================================================

    event MarketCreated(
        uint256 indexed marketId,
        string title,
        address indexed creator,
        uint256 timestamp
    );

    event PositionOpened(
        uint256 indexed marketId,
        address indexed trader,
        bool isYes,
        uint256 amount,
        uint256 timestamp
    );

    event MarketResolved(
        uint256 indexed marketId,
        Outcome winningOutcome,
        uint256 timestamp
    );

    event PositionClaimed(
        uint256 indexed marketId,
        address indexed trader,
        uint256 payout,
        uint256 timestamp
    );

    event LiquidityAdded(
        uint256 indexed marketId,
        uint256 yesLiquidity,
        uint256 noLiquidity
    );

    // ========================================================================
    // Modifiers
    // ========================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier marketExists(uint256 marketId) {
        require(marketId > 0 && marketId <= marketCount, "Market not found");
        _;
    }

    modifier marketNotResolved(uint256 marketId) {
        require(!markets[marketId].resolved, "Market already resolved");
        _;
    }

    modifier marketResolved(uint256 marketId) {
        require(markets[marketId].resolved, "Market not resolved");
        _;
    }

    // ========================================================================
    // Constructor
    // ========================================================================

    constructor() {
        owner = msg.sender;
    }

    // ========================================================================
    // Public Functions: Market Management
    // ========================================================================

    /**
     * Create a new prediction market
     */
    function createMarket(string memory title) external returns (uint256) {
        require(bytes(title).length > 0, "Title required");

        marketCount++;
        uint256 marketId = marketCount;

        markets[marketId] = Market({
            title: title,
            createdAt: block.timestamp,
            totalYesLiquidity: 0,
            totalNoLiquidity: 0,
            winningOutcome: Outcome.PENDING,
            resolved: false,
            owner: msg.sender
        });

        emit MarketCreated(marketId, title, msg.sender, block.timestamp);
        return marketId;
    }

    /**
     * Open a position in a market (copy-trade execution)
     */
    function openPosition(uint256 marketId, bool isYes)
        external
        payable
        marketExists(marketId)
        marketNotResolved(marketId)
        returns (bool)
    {
        require(msg.value > 0, "Amount required");

        Market storage market = markets[marketId];

        // Record position
        Position storage pos = positions[marketId][msg.sender];
        pos.isYes = isYes;
        pos.amount += msg.value;
        pos.timestamp = block.timestamp;
        pos.claimed = false;

        // Update market liquidity
        if (isYes) {
            market.totalYesLiquidity += msg.value;
        } else {
            market.totalNoLiquidity += msg.value;
        }

        totalVolume += msg.value;

        emit PositionOpened(
            marketId,
            msg.sender,
            isYes,
            msg.value,
            block.timestamp
        );

        return true;
    }

    /**
     * Resolve a market with the winning outcome
     */
    function resolveMarket(uint256 marketId, uint8 outcomeId)
        external
        onlyOwner
        marketExists(marketId)
        marketNotResolved(marketId)
    {
        require(outcomeId == 1 || outcomeId == 2, "Invalid outcome");

        Market storage market = markets[marketId];
        market.winningOutcome = Outcome(outcomeId);
        market.resolved = true;

        emit MarketResolved(
            marketId,
            market.winningOutcome,
            block.timestamp
        );
    }

    /**
     * Claim winnings after market resolution
     */
    function claimWinnings(uint256 marketId)
        external
        marketExists(marketId)
        marketResolved(marketId)
        returns (uint256)
    {
        Position storage pos = positions[marketId][msg.sender];
        require(pos.amount > 0, "No position");
        require(!pos.claimed, "Already claimed");

        Market storage market = markets[marketId];

        // Calculate payout
        uint256 payout = 0;

        if (market.winningOutcome == Outcome.YES && pos.isYes) {
            // YES position won
            uint256 totalPool = market.totalYesLiquidity +
                market.totalNoLiquidity;
            payout = pos.amount + ((market.totalNoLiquidity * pos.amount) /
                market.totalYesLiquidity);
        } else if (market.winningOutcome == Outcome.NO && !pos.isYes) {
            // NO position won
            uint256 totalPool = market.totalYesLiquidity +
                market.totalNoLiquidity;
            payout = pos.amount + ((market.totalYesLiquidity * pos.amount) /
                market.totalNoLiquidity);
        } else {
            // Losing position - no payout
            payout = 0;
        }

        pos.claimed = true;

        // Transfer payout
        if (payout > 0) {
            (bool success, ) = msg.sender.call{value: payout}("");
            require(success, "Transfer failed");
        }

        emit PositionClaimed(marketId, msg.sender, payout, block.timestamp);

        return payout;
    }

    // ========================================================================
    // Public Functions: View/Query
    // ========================================================================

    /**
     * Get market details
     */
    function getMarket(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (Market memory)
    {
        return markets[marketId];
    }

    /**
     * Get user position in a market
     */
    function getUserPosition(uint256 marketId, address user)
        external
        view
        marketExists(marketId)
        returns (Position memory)
    {
        return positions[marketId][user];
    }

    /**
     * Get position size for user
     */
    function getPositionSize(uint256 marketId, address user)
        external
        view
        returns (uint256)
    {
        return positions[marketId][user].amount;
    }

    /**
     * Check if position is winning (before claiming)
     */
    function isWinningPosition(uint256 marketId, address user)
        external
        view
        marketExists(marketId)
        marketResolved(marketId)
        returns (bool)
    {
        Position memory pos = positions[marketId][user];
        Market memory market = markets[marketId];

        if (market.winningOutcome == Outcome.YES) {
            return pos.isYes;
        } else if (market.winningOutcome == Outcome.NO) {
            return !pos.isYes;
        }

        return false;
    }

    /**
     * Calculate potential payout before claiming
     */
    function calculatePayout(uint256 marketId, address user)
        external
        view
        marketExists(marketId)
        marketResolved(marketId)
        returns (uint256)
    {
        Position memory pos = positions[marketId][user];
        Market memory market = markets[marketId];

        if (pos.amount == 0) {
            return 0;
        }

        if (market.winningOutcome == Outcome.YES && pos.isYes) {
            // YES position won
            return pos.amount + ((market.totalNoLiquidity * pos.amount) /
                market.totalYesLiquidity);
        } else if (market.winningOutcome == Outcome.NO && !pos.isYes) {
            // NO position won
            return pos.amount + ((market.totalYesLiquidity * pos.amount) /
                market.totalNoLiquidity);
        }

        return 0;
    }

    /**
     * Get market statistics
     */
    function getMarketStats(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (
            uint256 yesLiquidity,
            uint256 noLiquidity,
            uint256 totalLiquidity,
            uint256 yesPercentage
        )
    {
        Market memory market = markets[marketId];
        totalLiquidity = market.totalYesLiquidity + market.totalNoLiquidity;
        yesPercentage = totalLiquidity > 0
            ? (market.totalYesLiquidity * 100) / totalLiquidity
            : 50;

        return (
            market.totalYesLiquidity,
            market.totalNoLiquidity,
            totalLiquidity,
            yesPercentage
        );
    }

    // ========================================================================
    // Owner Functions
    // ========================================================================

    /**
     * Emergency: Withdraw contract balance
     */
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = owner.call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }

    /**
     * Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        owner = newOwner;
    }

    // ========================================================================
    // Fallback: Receive ETH
    // ========================================================================

    receive() external payable {}
}
