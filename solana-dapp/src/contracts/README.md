# Smart Contracts

This directory contains the Solidity smart contracts for the Solana Prediction Market platform.

## Contracts

### SimplePredictionMarket.sol
Main prediction market contract that handles:
- Creating prediction markets
- Placing bets (YES/NO)
- Resolving market outcomes
- Tracking user balances

### MarketBot.sol
Automated copy-trading bot that:
- Follows whale wallet trades
- Automatically places mirrored bets
- Configurable copy delay
- Enable/disable controls
