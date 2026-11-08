import React from 'react'

interface PoolSplitProps {
  yesPool: number
  noPool: number
}

const PoolSplit: React.FC<PoolSplitProps> = ({ yesPool, noPool }) => {
  const total = yesPool + noPool
  const yes = total > 0 ? (yesPool / total) * 100 : 50
  const no = 100 - yes

  return (
    <div>
      <div className="split__labels">
        <span className="split__yes">YES {yes.toFixed(0)}%</span>
        <span className="split__no">NO {no.toFixed(0)}%</span>
      </div>
      <div className="split__bar" aria-hidden="true">
        <span style={{ width: `${yes}%` }} />
        <span style={{ width: `${no}%` }} />
      </div>
    </div>
  )
}

export default PoolSplit
