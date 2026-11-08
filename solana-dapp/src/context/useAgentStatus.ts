import { useEffect, useState } from 'react'
import { fetchAgentStatus } from '../utils/agentApi'
import type { AgentStatus } from '../utils/agentApi'

const REFRESH_MS = 15000

/** undefined while checking, null when the agent can't be reached. */
export function useAgentStatus(): AgentStatus | null | undefined {
  const [status, setStatus] = useState<AgentStatus | null | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    const load = () =>
      fetchAgentStatus()
        .then((next) => !disposed && setStatus(next))
        .catch(() => !disposed && setStatus(null))
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])

  return status
}
