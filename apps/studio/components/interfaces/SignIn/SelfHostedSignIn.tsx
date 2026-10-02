import { useRouter } from 'next/router'
import { FormEvent, useEffect, useState } from 'react'
import { Button, Input } from 'ui'

import { AuthenticationLayout } from '@/components/layouts/AuthenticationLayout'
import { BASE_PATH } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const LOGIN_API = `${BASE_PATH}/api/self-hosted/login`
const HOME = '/project/default'

/**
 * Sign-in for self-hosted Studio (STUDIO_SELF_HOSTED_LOGIN=true): a
 * username/password form against DASHBOARD_USERNAME / DASHBOARD_PASSWORD.
 * Without the flag it behaves as before and goes straight to the project.
 */
export const SelfHostedSignInPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)

  const requested = router.query.returnTo
  const returnTo =
    typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
      ? requested
      : HOME

  useEffect(() => {
    let cancelled = false
    fetch(LOGIN_API)
      .then(async (res) => res.ok && (await res.json()).enabled === true)
      .catch(() => false)
      .then((on) => {
        if (cancelled) return
        if (on) setEnabled(true)
        else router.replace(HOME)
      })
    return () => {
      cancelled = true
    }
  }, [router])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(undefined)
    const res = await fetch(LOGIN_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).catch(() => undefined)
    if (res?.ok) {
      router.replace(returnTo)
      return
    }
    setError(
      res?.status === 401 ? 'Invalid username or password' : 'Sign-in failed, please try again'
    )
    setSubmitting(false)
  }

  if (!enabled) return null

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-md border bg-surface-100 p-6"
      >
        <div>
          <h1 className="text-xl text-foreground">Sign in to Studio</h1>
          <p className="text-sm text-foreground-light">Supabase dashboard for this project.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm text-foreground-light">
          Username
          <Input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            disabled={submitting}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-foreground-light">
          Password
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={submitting}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button block type="submit" size="large" loading={submitting} disabled={submitting}>
          Continue
        </Button>
      </form>
    </div>
  )
}

SelfHostedSignInPage.getLayout = (page) => <AuthenticationLayout>{page}</AuthenticationLayout>
