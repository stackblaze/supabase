import { useEffect, useState } from 'react'

import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'

type SelfHostedSession = { kind: 'dashboard' } | { kind: 'user'; email: string }

let cached: Promise<SelfHostedSession | undefined> | undefined

/** Who the self-hosted session belongs to; asked once per page load. */
function fetchSelfHostedSession(): Promise<SelfHostedSession | undefined> {
  if (IS_PLATFORM || typeof fetch !== 'function') return Promise.resolve(undefined)
  cached ??= fetch(`${BASE_PATH}/api/self-hosted/session`)
    .then(async (res) => (res.ok ? ((await res.json()) as SelfHostedSession) : undefined))
    .catch(() => undefined)
  return cached
}

export function useSelfHostedSession(): SelfHostedSession | undefined {
  const [session, setSession] = useState<SelfHostedSession>()
  useEffect(() => {
    let cancelled = false
    fetchSelfHostedSession().then((value) => {
      if (!cancelled) setSession(value)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return session
}
