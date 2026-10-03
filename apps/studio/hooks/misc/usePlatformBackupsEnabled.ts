import { useEffect, useState } from 'react'

import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'

let cached: Promise<boolean> | undefined

/**
 * Whether this self-hosted Studio can show the platform's backups of its
 * database (KUBERO_APP_TOKEN & co. set at deploy). Asked once per page load.
 */
export function fetchPlatformBackupsEnabled(): Promise<boolean> {
  if (IS_PLATFORM || typeof fetch !== 'function') return Promise.resolve(false)
  cached ??= fetch(`${BASE_PATH}/api/self-hosted/backups`)
    .then(async (res) => res.ok && (await res.json()).enabled === true)
    .catch(() => false)
  return cached
}

export function usePlatformBackupsEnabled(): boolean {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchPlatformBackupsEnabled().then((on) => {
      if (!cancelled) setEnabled(on)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return enabled
}
