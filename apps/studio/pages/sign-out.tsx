import { useRouter } from 'next/router'
import { useEffect } from 'react'

import { BASE_PATH } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

/** Self-hosted sign-out: clear the session cookie, then back to sign-in. */
const SignOutPage: NextPageWithLayout = () => {
  const router = useRouter()
  useEffect(() => {
    fetch(`${BASE_PATH}/api/self-hosted/login`, { method: 'DELETE' })
      .catch(() => undefined)
      .then(() => router.replace('/sign-in'))
  }, [router])
  return null
}

export default SignOutPage
