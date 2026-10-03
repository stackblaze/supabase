import { useRouter } from 'next/router'
import { useEffect } from 'react'

import type { NextPageWithLayout } from '@/types'

/** Self-hosted has one backups page; the hosted tabs redirect to it. */
export const SelfHostedBackupsRedirect: NextPageWithLayout = () => {
  const router = useRouter()
  useEffect(() => {
    const ref = typeof router.query.ref === 'string' ? router.query.ref : 'default'
    router.replace(`/project/${ref}/database/backups/scheduled`)
  }, [router])
  return null
}
