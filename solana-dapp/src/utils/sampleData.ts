export interface SampleMarket {
  id: string
  title: string
  description: string
  yesPool: number
  noPool: number
  confidence: number
  timestamp: string
}

export const SAMPLE_MARKETS: SampleMarket[] = [
  { id: '1', title: 'Will SOL reach $200 by EOY?', description: 'Prediction market for Solana price trajectory', yesPool: 150, noPool: 75, confidence: 82.5, timestamp: '2 hours ago' },
  { id: '2', title: 'Will Polygon testnet deploy new upgrade?', description: 'Next major Polygon Amoy network upgrade', yesPool: 200, noPool: 100, confidence: 68.3, timestamp: '5 hours ago' },
  { id: '3', title: 'Will Bitcoin hit $100K in Q1?', description: 'Bitcoin price prediction for next quarter', yesPool: 300, noPool: 150, confidence: 75.2, timestamp: '1 day ago' },
]

export const SAMPLE_TRANSACTIONS = [
  { id: 'tx1', type: 'Copy trade', market: 'SOL $200 Prediction', outcome: 'YES', amount: 5.0, status: 'completed', timestamp: '2 hours ago', txHash: '5xK3...8mP2' },
  { id: 'tx2', type: 'Copy trade', market: 'Polygon Upgrade', outcome: 'YES', amount: 10.0, status: 'completed', timestamp: '5 hours ago', txHash: '2jA9...nP7Q' },
  { id: 'tx3', type: 'Copy trade', market: 'BTC $100K Q1', outcome: 'NO', amount: 15.0, status: 'pending', timestamp: '1 day ago', txHash: '9zX4...mK8R' },
]
