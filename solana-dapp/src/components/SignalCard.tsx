import React from 'react'
import type { RiskConfig, TradeSignal } from '../utils/agentApi'
import { formatDateTime, formatPercent, formatUsd } from '../utils/format'

interface MeterProps {
  label: string
  value: number
  limit: number
  limitLabel: string
  good: boolean
}

const Meter: React.FC<MeterProps> = ({ label, value, limit, limitLabel, good }) => (
  <div>
    <div className="meter__row">
      <span>{label}</span>
      <span className="meter__value">
        {formatPercent(value)} <span className="meter__limit">· {limitLabel} {formatPercent(limit)}</span>
      </span>
    </div>
    <div className="meter__track">
      <span className={`meter__fill${good ? '' : ' meter__fill--bad'}`} style={{ width: `${Math.min(value * 100, 100)}%` }} />
      <span className="meter__tick" style={{ left: `${Math.min(limit * 100, 100)}%` }} />
    </div>
  </div>
)

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function executionText(execution: NonNullable<TradeSignal['execution']>): string {
  const amount = execution.amountUsdc !== undefined ? formatUsd(execution.amountUsdc) : ''
  switch (execution.status) {
    case 'dry_run':
      return `Would buy ${amount} · no order sent`
    case 'placed':
      return `Order placed · ${amount}`
    case 'failed':
      return `Order failed · ${amount} held against today’s limit`
    case 'duplicate':
      return 'Already copied'
    default:
      return 'Not copied'
  }
}

const Validation: React.FC<{ signal: TradeSignal }> = ({ signal }) => {
  const { validation, execution } = signal
  if (!validation) return null
  const failed = validation.checks.find((check) => !check.passed)

  return (
    <div className="signal__validation">
      <span className={validation.approved ? 'ok' : 'bad'}>
        {validation.approved ? `Passed all rules · ${validation.supportingDomains.length} sites agree` : `Blocked · ${failed?.detail}`}
      </span>
      {execution && (
        <span className="money" title={execution.detail}>
          {executionText(execution)}
        </span>
      )}
    </div>
  )
}

const SignalCard: React.FC<{ signal: TradeSignal; config: RiskConfig }> = ({ signal, config }) => {
  const sourceLinks = (signal.sources ?? []).filter((s) => s.kind === 'market' && s.stance !== 'neutral' && /^https?:\/\//i.test(s.url))

  return (
    <article className={`signal signal--${signal.recommendation}`}>
      <div className="signal__top">
        <span className="signal__rec">{signal.recommendation}</span>
        <span className="signal__market" title={signal.market}>
          {signal.market || 'Unknown market'}
        </span>
        <time className="signal__time" dateTime={signal.timestamp}>
          {formatDateTime(signal.timestamp)}
        </time>
      </div>

      <div className="signal__body">
        <div className="signal__call">
          {signal.action} <span>{signal.position}</span>
        </div>
        <Meter label="Confidence" value={signal.confidence} limit={config.minConfidence} limitLabel="min" good={signal.confidence >= config.minConfidence} />
        <Meter label="Risk" value={signal.riskScore} limit={config.maxRiskScore} limitLabel="max" good={signal.riskScore <= config.maxRiskScore} />
      </div>

      <p className="signal__why">{signal.reasoning}</p>

      <Validation signal={signal} />

      {sourceLinks.length > 0 ? (
        <div className="signal__foot">
          {sourceLinks.map((source) => (
            <a className={`tag tag--${source.stance}`} key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}>
              {source.stance === 'supports' ? 'Supports' : 'Contradicts'}: {hostOf(source.url)}
            </a>
          ))}
        </div>
      ) : (
        signal.sentimentSources &&
        signal.sentimentSources.length > 0 && (
          <div className="signal__foot">
            {signal.sentimentSources.map((source) => (
              <span className="tag" key={source}>
                {source}
              </span>
            ))}
          </div>
        )
      )}
    </article>
  )
}

export default SignalCard
