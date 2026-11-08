import React, { useMemo, useState } from 'react'
import RiskControls from '../components/RiskControls'
import SignalCard from '../components/SignalCard'
import { useAgent } from '../context/useAgent'
import type { Connection } from '../context/useAgent'
import type { Recommendation } from '../utils/agentApi'

type Filter = 'ALL' | Recommendation

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'EXECUTE', label: 'Execute' },
  { id: 'REVIEW', label: 'Review' },
  { id: 'SKIP', label: 'Skip' },
]

const CONNECTION_LABELS: Record<Connection, string> = {
  connecting: 'Connecting',
  online: 'Agent online',
  offline: 'Agent offline',
}

const DashboardAgent: React.FC = () => {
  const { signals, config, wallets, agentMode, connection, loading, saveState, updateConfig } = useAgent()
  const [filter, setFilter] = useState<Filter>('ALL')

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { ALL: signals.length, EXECUTE: 0, REVIEW: 0, SKIP: 0 }
    signals.forEach((s) => {
      result[s.recommendation] += 1
    })
    return result
  }, [signals])

  const visible = filter === 'ALL' ? signals : signals.filter((s) => s.recommendation === filter)
  const executeRate = signals.length ? (counts.EXECUTE / signals.length) * 100 : null
  const avgConfidence = signals.length ? (signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length) * 100 : null

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">Agent dashboard</h1>
          <p className="page__sub">Whale trades scored by the AI agent, as they arrive.</p>
        </div>
        <span className={`pill pill--${connection}`} role="status">
          <span className="pill__dot" />
          {CONNECTION_LABELS[connection]}
        </span>
      </div>

      {connection === 'offline' && (
        <div className="notice notice--stop">
          <span>
            <strong>Can't reach the agent.</strong> Start it with <code>cd bot-agent &amp;&amp; npm run dev</code>. This
            page reconnects by itself.
          </span>
        </div>
      )}

      {agentMode?.executionMode === 'live' && (
        <div className="notice notice--stop">
          <span>
            <strong>Live trading is on.</strong> Signals that pass validation place real orders with real funds.
          </span>
        </div>
      )}

      {agentMode?.executionMode === 'dry_run' && (
        <div className="notice">
          <span>
            <strong>Dry run.</strong> Signals go through every check, but no orders are sent.
          </span>
        </div>
      )}

      {agentMode && !agentMode.webContextEnabled && (
        <div className="notice notice--warn">
          <span>
            <strong>Web validation is off.</strong> Set <code>FIRECRAWL_API_KEY</code> in <code>bot-agent/.env</code>. Until
            then, no trade can pass validation.
          </span>
        </div>
      )}

      <section className="stats" aria-label="Signal statistics">
        <div className="stat">
          <div className="stat__label">Signals loaded</div>
          <div className="stat__value">{signals.length}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Execute rate</div>
          <div className="stat__value">{executeRate === null ? '—' : `${executeRate.toFixed(0)}%`}</div>
        </div>
        <div className="stat">
          <div className="stat__label">Avg confidence</div>
          <div className="stat__value">{avgConfidence === null ? '—' : `${avgConfidence.toFixed(0)}%`}</div>
        </div>
      </section>

      <div className="agent-grid">
        <section aria-label="Trade signals">
          <div className="filters">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="filter"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <span className="filter__count">{counts[item.id]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="feed" aria-busy="true">
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              {signals.length > 0 ? (
                <strong>No {filter.toLowerCase()} signals</strong>
              ) : (
                <>
                  <strong>No signals yet</strong>
                  {connection === 'online' ? 'Waiting for whale activity.' : 'Signals will appear once the agent is running.'}
                </>
              )}
            </div>
          ) : (
            <div className="feed">
              {visible.map((signal) => (
                <SignalCard key={`${signal.timestamp}-${signal.market}-${signal.reasoning}`} signal={signal} config={config} cluster={agentMode?.solana?.cluster} />
              ))}
            </div>
          )}
        </section>

        <aside className="agent-side">
          <RiskControls
            config={config}
            wallets={wallets}
            disabled={connection !== 'online'}
            saveState={saveState}
            status={agentMode}
            onChange={updateConfig}
          />
        </aside>
      </div>
    </main>
  )
}

export default DashboardAgent
