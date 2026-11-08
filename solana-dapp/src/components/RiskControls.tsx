import React, { useState } from 'react'
import type { AgentStatus, RiskConfig } from '../utils/agentApi'
import type { SaveState } from '../context/useAgent'
import { explorerUrl, formatPercent, formatUsd } from '../utils/format'

interface RiskControlsProps {
  config: RiskConfig
  wallets: string[]
  disabled: boolean
  saveState: SaveState
  status: AgentStatus | null
  onChange: (change: Partial<RiskConfig>) => void
}

const SAVE_LABELS: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save',
}

const RiskControls: React.FC<RiskControlsProps> = ({ config, wallets, disabled, saveState, status, onChange }) => {
  const [confirming, setConfirming] = useState(false)
  const live = status?.executionMode === 'live'
  const limits = status?.limits

  return (
    <section className="panel" aria-labelledby="risk-title">
      <div className="panel__head">
        <h2 className="panel__title" id="risk-title">
          Risk controls
        </h2>
        <span className={`save${saveState === 'error' ? ' save--error' : ''}`} role="status">
          {SAVE_LABELS[saveState]}
        </span>
      </div>

      <div className="field">
        <label className="field__row" htmlFor="max-risk">
          <span>Max risk score</span>
          <span className="field__value">{formatPercent(config.maxRiskScore)}</span>
        </label>
        <input
          id="max-risk"
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={config.maxRiskScore}
          disabled={disabled}
          onChange={(e) => onChange({ maxRiskScore: Number(e.target.value) })}
        />
      </div>

      <div className="field">
        <label className="field__row" htmlFor="min-confidence">
          <span>Min confidence</span>
          <span className="field__value">{formatPercent(config.minConfidence)}</span>
        </label>
        <input
          id="min-confidence"
          type="range"
          min="0.05"
          max="1"
          step="0.05"
          value={config.minConfidence}
          disabled={disabled}
          onChange={(e) => onChange({ minConfidence: Number(e.target.value) })}
        />
      </div>

      <label className="switch">
        <input
          type="checkbox"
          checked={config.autoExecute}
          disabled={disabled || confirming}
          onChange={(e) => {
            // Turning automation off is always safe. Turning it on needs a deliberate second step.
            if (e.target.checked) setConfirming(true)
            else onChange({ autoExecute: false })
          }}
        />
        <span>
          Auto-execute
          <span className="switch__hint">
            {live ? 'Strong signals place real orders with no further approval.' : 'Strong signals are simulated. No orders are sent in dry run.'}
          </span>
        </span>
      </label>

      {confirming && (
        <div className={`confirm${live ? ' confirm--live' : ''}`} role="alert">
          <p>
            {live ? (
              <>
                <strong>This will spend real money.</strong> Signals that pass every rule will place orders on their own
                {limits ? `, up to ${formatUsd(limits.maxOrderUsdc)} each and ${formatUsd(limits.maxDailyUsdc)} a day.` : '.'}
              </>
            ) : (
              <>Signals that pass every rule will be marked EXECUTE and simulated. No money moves in dry run.</>
            )}
          </p>
          <div className="button-row">
            <button className="button button--secondary" type="button" autoFocus onClick={() => setConfirming(false)}>
              Keep off
            </button>
            <button
              className={`button${live ? ' button--danger' : ''}`}
              type="button"
              onClick={() => {
                setConfirming(false)
                onChange({ autoExecute: true })
              }}
            >
              Turn on
            </button>
          </div>
        </div>
      )}

      {limits && (
        <div className="section-rule">
          <h3>Spending limits</h3>
          <ul className="rows">
            <li>
              <span>Per order</span>
              <span className="money">{formatUsd(limits.maxOrderUsdc)}</span>
            </li>
            <li>
              <span>Per day</span>
              <span className="money">{formatUsd(limits.maxDailyUsdc)}</span>
            </li>
            <li>
              <span>Spent today</span>
              <span className="money">{live ? formatUsd(limits.spentTodayUsdc) : `${formatUsd(0)} (dry run)`}</span>
            </li>
            <li>
              <span>Enforced on Solana</span>
              <span>
                {status?.solana ? (
                  <a className="solana-link" href={explorerUrl('address', status.solana.policy, status.solana.cluster)} target="_blank" rel="noopener noreferrer">
                    View policy
                  </a>
                ) : (
                  'Not set up'
                )}
              </span>
            </li>
          </ul>
        </div>
      )}

      <div className="section-rule">
        <h3>How signals are sorted</h3>
        <ul className="rules">
          <li>
            <b style={{ color: 'var(--stop)' }}>SKIP</b>
            <span>Risk above {formatPercent(config.maxRiskScore)}</span>
          </li>
          <li>
            <b style={{ color: 'var(--hold)' }}>REVIEW</b>
            <span>{config.autoExecute ? 'Passes risk, but not strong enough or a rule failed' : 'Everything that passes risk'}</span>
          </li>
          {config.autoExecute && (
            <li>
              <b style={{ color: 'var(--go)' }}>EXECUTE</b>
              <span>Passes risk, confidence above {formatPercent(Math.max(config.minConfidence, 0.75))}, every rule passes</span>
            </li>
          )}
        </ul>
      </div>

      <div className="section-rule">
        <h3>Wallet you follow</h3>
        {wallets.length === 0 ? (
          <p className="muted wallet">None loaded</p>
        ) : (
          wallets.map((wallet) => (
            <p className="wallet" key={wallet}>
              {wallet}
            </p>
          ))
        )}
      </div>
    </section>
  )
}

export default RiskControls
