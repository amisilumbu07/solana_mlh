import React from 'react'
import MarketCard from '../components/MarketCard'
import { SAMPLE_MARKETS } from '../utils/sampleData'

const Dashboard: React.FC = () => (
  <main className="page">
    <div className="page__head">
      <div>
        <h1 className="page__title">Markets</h1>
        <p className="page__sub">Where the money sits on each outcome.</p>
      </div>
    </div>

    <div className="notice">
      <span>
        <strong>Sample markets.</strong> These aren't connected to a chain yet.
      </span>
    </div>

    <div className="market-grid">
      {SAMPLE_MARKETS.map((market) => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  </main>
)

export default Dashboard
