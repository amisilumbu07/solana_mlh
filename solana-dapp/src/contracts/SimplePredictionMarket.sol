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
        address creator;
        uint256 createdAt;
    }

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesBalances;
    mapping(uint256 => mapping(address => uint256)) public noBalances;
    uint256 public marketCount;
    
    event MarketCreated(uint256 indexed marketId, string title);
    event PositionBet(uint256 indexed marketId, address indexed better, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome winner);

    constructor() {
        marketCount = 0;
    }

    function createMarket(string memory title) external returns (uint256) {
        marketCount++;
        markets[marketCount] = Market({
            title: title,
            totalYesPool: 0,
            totalNoPool: 0,
            winningOutcome: Outcome.PENDING,
            resolved: false,
            creator: msg.sender,
            createdAt: block.timestamp
        });
        emit MarketCreated(marketCount, title);
        return marketCount;
    }

    function bet(uint256 marketId, bool isYes) external payable {
        require(!markets[marketId].resolved, "Market resolved");
        require(msg.value > 0, "Zero liquidity");

        if (isYes) {
            yesBalances[marketId][msg.sender] += msg.value;
            markets[marketId].totalYesPool += msg.value;
        } else {
            noBalances[marketId][msg.sender] += msg.value;
            markets[marketId].totalNoPool += msg.value;
        }

        emit PositionBet(marketId, msg.sender, isYes, msg.value);
    }

    function resolveMarket(uint256 marketId, Outcome winner) external {
        require(!markets[marketId].resolved, "Already resolved");
        require(winner != Outcome.PENDING, "Invalid winner");
        require(msg.sender == markets[marketId].creator, "Not authorized");

        markets[marketId].winningOutcome = winner;
        markets[marketId].resolved = true;

        emit MarketResolved(marketId, winner);
    }
}
