export type Recommendation = 'EXECUTE' | 'REVIEW' | 'SKIP'

export interface SignalSource {
  title: string
  url: string
  kind: 'market' | 'macro'
  stance: 'supports' | 'contradicts' | 'neutral'
}

export interface TradeSignal {
  id?: string
  sources?: SignalSource[]
  validation?: {
    approved: boolean
    checks: { name: string; passed: boolean; detail: string }[]
    supportingDomains: string[]
  }
  execution?: {
    status: 'dry_run' | 'placed' | 'failed' | 'duplicate' | 'skipped' | 'not_attempted'
    detail: string
    amountUsdc?: number
    solanaTx?: string
  }
  timestamp: string
  market?: string
  action: 'BUY' | 'SELL' | 'HOLD'
  position: 'YES' | 'NO'
  confidence: number
  riskScore: number
  reasoning: string
  sentimentSources?: string[]
  recommendation: Recommendation
}

export interface RiskConfig {
  maxRiskScore: number
  minConfidence: number
  autoExecute: boolean
}

export interface AgentStatus {
  executionMode: 'live' | 'dry_run'
  webContextEnabled: boolean
  limits?: { maxOrderUsdc: number; maxDailyUsdc: number; spentTodayUsdc: number }
  solana?: { programId: string; policy: string; cluster: string } | null
}

const AGENT_URL =(import.meta.env.VITE_AGENT_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export const AGENT_WS_URL = AGENT_URL.replace(/^http/, 'ws')

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Agent responded with ${response.status}`)
  }
  return response.json()
}

export async function fetchSnapshot() {
  const [config, history] = await Promise.all([
    fetch(`${AGENT_URL}/api/config`).then((r) =>
      readJson<AgentStatus & { riskConfig: RiskConfig; trackedWallets: string[] }>(r),
    ),
    fetch(`${AGENT_URL}/api/trade-history`).then((r) => readJson<TradeSignal[]>(r)),
  ])
  return { ...config, history }
}

export async function fetchAgentStatus(): Promise<AgentStatus> {
  return fetch(`${AGENT_URL}/api/config`).then((r) => readJson<AgentStatus>(r))
}

// The agent issues this to the local dashboard. It stays in memory and can only change risk settings.
let session: { token: string; expiresAt: number } | null = null

async function dashboardToken(): Promise<string> {
  if (session && session.expiresAt > Date.now() / 1000 + 30) return session.token
  const issued = await fetch(`${AGENT_URL}/api/session/dashboard`, { method: 'POST' }).then((r) =>
    readJson<{ token: string; expiresAt: number }>(r),
  )
  session = issued
  return issued.token
}

export async function saveRiskConfig(config: RiskConfig): Promise<RiskConfig> {
  const post = async () =>
    fetch(`${AGENT_URL}/api/risk-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await dashboardToken()}` },
      body: JSON.stringify(config),
    })

  let response = await post()
  if (response.status === 401) {
    // The agent restarted, so tokens it issued before no longer verify.
    session = null
    response = await post()
  }
  const result = await readJson<{ config: RiskConfig }>(response)
  return result.config
}
