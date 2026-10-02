import { useEffect, useState } from 'react'

import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'

let cached: Promise<boolean> | undefined

/**
 * Whether this self-hosted Studio has its sign-in page switched on
 * (STUDIO_SELF_HOSTED_LOGIN). Asked once per page load; always false on the
 * platform, where accounts handle sign-in.
 */
export function fetchSelfHostedLoginEnabled(): Promise<boolean> {
  if (IS_PLATFORM || typeof fetch !== 'function') return Promise.resolve(false)
  cached ??= fetch(`${BASE_PATH}/api/self-hosted/login`)
    .then(async (res) => res.ok && (await res.json()).enabled === true)
    .catch(() => false)
  return cached
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
