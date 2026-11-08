import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PoolSplit from '../components/PoolSplit'
import { formatSol } from '../utils/format'
import { SAMPLE_MARKETS } from '../utils/sampleData'

type Choice = 'YES' | 'NO'
type Stage = 'edit' | 'review' | 'done'

const Market: React.FC = () => {
  const { id } = useParams()
  const market = SAMPLE_MARKETS.find((m) => m.id === id)
  const [amount, setAmount] = useState('')
  const [choice, setChoice] = useState<Choice | null>(null)
  const [stage, setStage] = useState<Stage>('edit')

  if (!market) {
    return (
      <main className="page page--narrow">
        <Link to="/markets" className="back">
          ← Markets
        </Link>
        <div className="empty">
          <strong>Market not found</strong>
          It may have been removed, or the link is wrong.
        </div>
      </main>
    )
  }

  const stake = Number(amount)
  const validStake = amount !== '' && Number.isFinite(stake) && stake > 0
  const amountError = amount !== '' && !validStake ? 'Enter an amount greater than 0.' : null
  const total = market.yesPool + market.noPool
  const sidePool = choice === 'YES' ? market.yesPool : market.noPool
  // Winners split the whole pool in proportion to their stake.
  const payout = validStake && choice ? (stake / (sidePool + stake)) * (total + stake) : null
  const ready = validStake && choice !== null

  const reset = () => {
    setAmount('')
    setChoice(null)
    setStage('edit')
  }

  const summary = payout !== null && (
    <ul className="rows quote">
      <li>
        <span>Your position</span>
        <span>{choice}</span>
      </li>
      <li>
        <span>You pay</span>
        <span className="money">{formatSol(stake)}</span>
      </li>
      <li>
        <span>If {choice} wins, you get about</span>
        <span className="money">{formatSol(payout)}</span>
      </li>
      <li className="total">
        <span>If {choice} loses, you lose</span>
        <span className="money">{formatSol(stake)}</span>
      </li>
    </ul>
  )

  return (
    <main className="page page--narrow">
      <Link to="/markets" className="back">
        ← Markets
      </Link>

      <div className="page__head">
        <div>
          <h1 className="page__title">{market.title}</h1>
          <p className="page__sub">{market.description}</p>
        </div>
      </div>

      <div className="notice">
        <strong>Sample market.</strong> Bets here are simulated and move no funds.
      </div>

      <div className="detail">
        <section className="panel" aria-label="Pools">
          <PoolSplit yesPool={market.yesPool} noPool={market.noPool} />
          <div className="pools">
            <div>
              <div className="pool__label">YES pool</div>
              <div className="pool__value">{formatSol(market.yesPool)}</div>
            </div>
            <div>
              <div className="pool__label">NO pool</div>
              <div className="pool__value">{formatSol(market.noPool)}</div>
            </div>
          </div>
        </section>

        {stage === 'edit' && (
          <form
            className="panel"
            onSubmit={(event) => {
              event.preventDefault()
              if (ready) setStage('review')
            }}
          >
            <div className="panel__head">
              <h2 className="panel__title">Simulate a bet</h2>
            </div>

            <div className="choice">
              {(['YES', 'NO'] as Choice[]).map((option) => (
                <button key={option} type="button" aria-pressed={choice === option} onClick={() => setChoice(option)}>
                  {option}
                </button>
              ))}
            </div>

            <div className="field">
              <label className="field__row" htmlFor="amount">
                <span>Amount (SOL)</span>
              </label>
              <input
                id="amount"
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                aria-invalid={amountError !== null}
                aria-describedby={amountError ? 'amount-error' : undefined}
                onChange={(e) => setAmount(e.target.value)}
              />
              {amountError && (
                <p className="field__error" id="amount-error">
                  {amountError}
                </p>
              )}
            </div>

            <button className="button button--full" type="submit" disabled={!ready}>
              Review bet
            </button>
          </form>
        )}

        {stage === 'review' && (
          <section className="panel" aria-label="Review bet">
            <div className="panel__head">
              <h2 className="panel__title">Review your bet</h2>
            </div>
            {summary}
            <div className="button-row">
              <button className="button button--secondary" type="button" onClick={() => setStage('edit')}>
                Back
              </button>
              <button className="button" type="button" onClick={() => setStage('done')}>
                Confirm simulation
              </button>
            </div>
            <p className="fine">The payout is an estimate and changes as others bet.</p>
          </section>
        )}

        {stage === 'done' && (
          <section className="panel" aria-label="Simulation result">
            <p className="receipt" role="status">
              <strong>
                Simulated: {formatSol(stake)} on {choice}
              </strong>
              No transaction was sent and no funds moved.
            </p>
            <button className="button button--secondary button--full" type="button" onClick={reset}>
              Simulate another
            </button>
          </section>
        )}
      </div>
    </main>
  )
}

export default Market
