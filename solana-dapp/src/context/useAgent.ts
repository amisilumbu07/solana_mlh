import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_WS_URL, fetchSnapshot, saveRiskConfig } from '../utils/agentApi'
import type { AgentStatus, RiskConfig, TradeSignal } from '../utils/agentApi'

export type Connection = 'connecting' | 'online' | 'offline'
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const MAX_SIGNALS = 200
const MAX_RETRY_MS = 15000
const SAVE_DELAY_MS = 300

const signalKey = (s: TradeSignal) => `${s.timestamp}|${s.market}|${s.action}|${s.reasoning}`

export function mergeSignals(current: TradeSignal[], incoming: TradeSignal[]): TradeSignal[] {
  const byKey = new Map(current.map((s) => [signalKey(s), s]))
  incoming.forEach((s) => byKey.set(signalKey(s), s))
  return [...byKey.values()]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, MAX_SIGNALS)
}

export function useAgent() {
  const [signals, setSignals] = useState<TradeSignal[]>([])
  const [config, setConfig] = useState<RiskConfig>({ maxRiskScore: 0.7, minConfidence: 0.65, autoExecute: true })
  const [wallets, setWallets] = useState<string[]>([])
  const [agentMode, setAgentMode] = useState<AgentStatus | null>(null)
  const [connection, setConnection] = useState<Connection>('connecting')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  const configRef = useRef(config)
  const saveTimer = useRef<number | undefined>(undefined)
  const saveSeq = useRef(0)

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let retryTimer: number | undefined
    let attempt = 0

    const loadSnapshot = async () => {
      try {
        const snapshot = await fetchSnapshot()
        if (disposed) return
        // A pending slider change is newer than what the server just sent.
        if (saveTimer.current === undefined) {
          configRef.current = snapshot.riskConfig
          setConfig(snapshot.riskConfig)
        }
        setWallets(snapshot.trackedWallets)
        setAgentMode({ executionMode: snapshot.executionMode, webContextEnabled: snapshot.webContextEnabled, limits: snapshot.limits })
        setSignals((prev) => mergeSignals(prev, snapshot.history))
      } catch (error) {
        console.error('Failed to load agent state:', error)
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    const connect = () => {
      socket = new WebSocket(AGENT_WS_URL)

      socket.onopen = () => {
        attempt = 0
        setConnection('online')
        loadSnapshot()
      }

      socket.onmessage = (event) => {
        try {
          const signal: TradeSignal = JSON.parse(event.data)
          setSignals((prev) => mergeSignals(prev, [signal]))
        } catch (error) {
          console.error('Ignored malformed signal:', error)
        }
      }

      socket.onclose = () => {
        if (disposed) return
        setConnection('offline')
        setLoading(false)
        retryTimer = window.setTimeout(connect, Math.min(1000 * 2 ** attempt, MAX_RETRY_MS))
        attempt += 1
      }
    }

    connect()

    return () => {
      disposed = true
      window.clearTimeout(retryTimer)
      window.clearTimeout(saveTimer.current)
      saveTimer.current = undefined
      socket?.close()
    }
  }, [])

  const updateConfig = useCallback((change: Partial<RiskConfig>) => {
    const next = { ...configRef.current, ...change }
    configRef.current = next
    setConfig(next)
    setSaveState('saving')

    const seq = ++saveSeq.current
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      saveTimer.current = undefined
      try {
        const saved = await saveRiskConfig(next)
        if (seq !== saveSeq.current) return
        configRef.current = saved
        setConfig(saved)
        setSaveState('saved')
      } catch (error) {
        console.error('Failed to save risk config:', error)
        if (seq === saveSeq.current) setSaveState('error')
      }
    }, SAVE_DELAY_MS)
  }, [])

  return { signals, config, wallets, agentMode, connection, loading, saveState, updateConfig }
}
