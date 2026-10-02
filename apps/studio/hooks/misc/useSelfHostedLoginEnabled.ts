import { useEffect, useState } from 'react'

import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'

export type SelfHostedLoginMethods = { dashboard: boolean; email: boolean }
type SelfHostedLoginStatus = { enabled: boolean; methods: SelfHostedLoginMethods }

const OFF: SelfHostedLoginStatus = { enabled: false, methods: { dashboard: false, email: false } }

let cached: Promise<SelfHostedLoginStatus> | undefined

/**
 * Whether this self-hosted Studio has its sign-in page switched on
 * (STUDIO_SELF_HOSTED_LOGIN) and which methods it offers. Asked once per
 * page load; always off on the platform, where accounts handle sign-in.
 */
export function fetchSelfHostedLoginStatus(): Promise<SelfHostedLoginStatus> {
  if (IS_PLATFORM || typeof fetch !== 'function') return Promise.resolve(OFF)
  cached ??= fetch(`${BASE_PATH}/api/self-hosted/login`)
    .then(async (res) => {
      if (!res.ok) return OFF
      const body = (await res.json()) as Partial<SelfHostedLoginStatus>
      return {
        enabled: body.enabled === true,
        methods: {
          dashboard: body.methods?.dashboard === true,
          email: body.methods?.email === true,
        },
      }
    })
    .catch(() => OFF)
  return cached
}

function fetchSelfHostedLoginEnabled(): Promise<boolean> {
  return fetchSelfHostedLoginStatus().then((status) => status.enabled)
}

export function useSelfHostedLoginEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchSelfHostedLoginEnabled().then((on) => {
      if (!cancelled) setEnabled(on)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return enabled
}
