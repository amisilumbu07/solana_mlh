import React from 'react'
import { formatSol } from '../utils/format'
import { SAMPLE_TRANSACTIONS } from '../utils/sampleData'

const History: React.FC = () => (
  <main className="page page--narrow">
    <div className="page__head">
      <div>
        <h1 className="page__title">Trade history</h1>
        <p className="page__sub">Copied trades and market positions.</p>
      </div>
    </div>

    <div className="notice">
      <strong>Sample transactions.</strong> Real trades will appear here once execution is connected to this page.
    </div>

    <table className="table">
      <thead>
        <tr>
          <th scope="col">Market</th>
          <th scope="col">Position</th>
          <th scope="col" className="num">
            Amount
          </th>
          <th scope="col">Status</th>
          <th scope="col">Transaction</th>
          <th scope="col">Time</th>
        </tr>
      </thead>
      <tbody>
        {SAMPLE_TRANSACTIONS.map((tx) => (
          <tr key={tx.id}>
            <td data-label="Market">{tx.market}</td>
            <td data-label="Position" className={tx.outcome === 'YES' ? 'side-yes' : 'side-no'}>
              {tx.outcome}
            </td>
            <td data-label="Amount" className="num money">
              {formatSol(tx.amount)}
            </td>
            <td data-label="Status" className={`status status--${tx.status}`}>
              {tx.status}
            </td>
            <td data-label="Transaction" className="mono muted">
              {tx.txHash}
            </td>
            <td data-label="Time" className="muted">
              {tx.timestamp}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </main>
)

export default History
