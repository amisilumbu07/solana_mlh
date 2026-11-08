import React from 'react'
import { Link } from 'react-router-dom'
import PoolSplit from './PoolSplit'
import { formatSol } from '../utils/format'
import type { SampleMarket } from '../utils/sampleData'

const MarketCard: React.FC<{ market: SampleMarket }> = ({ market }) => (
  <Link to={`/market/${market.id}`} className="market">
    <h2 className="market__title">{market.title}</h2>
    <p className="market__desc">{market.description}</p>
    <PoolSplit yesPool={market.yesPool} noPool={market.noPool} />
    <div className="market__meta">
      <span>
        <span className="money">{formatSol(market.yesPool + market.noPool)}</span> · {market.timestamp}
      </span>
      <span>
        AI confidence <span className="mono">{market.confidence.toFixed(0)}%</span>
      </span>
    </div>
  </Link>
)

export default MarketCard
