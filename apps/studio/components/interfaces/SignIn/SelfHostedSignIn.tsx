import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { toast } from 'sonner'
import { Button, Form, FormControl, FormField, Input } from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import z from 'zod'

import { AuthenticationLayout } from '@/components/layouts/AuthenticationLayout'
import { SignInLayout } from '@/components/layouts/SignInLayout/SignInLayout'
import {
  fetchSelfHostedLoginStatus,
  type SelfHostedLoginMethods,
} from '@/hooks/misc/useSelfHostedLoginEnabled'
import { BASE_PATH } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const LOGIN_API = `${BASE_PATH}/api/self-hosted/login`
const MAGIC_LINK_API = `${BASE_PATH}/api/self-hosted/magic-link`
const HOME = '/project/default'

const schema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username'),
  password: z.string().min(1, 'Password is required'),
})

const isEmail = (value: string) => value.includes('@')

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => undefined)
  if (res?.ok) return { ok: true }
  const message = await res
    ?.json()
    .then((json: { error?: { message?: string } }) => json?.error?.message)
    .catch(() => undefined)
  return { ok: false, message: message ?? 'Sign-in failed, please try again' }
}

/** Tokens arrive from email links in the URL fragment (implicit flow). */
function readLinkFragment(): { accessToken?: string; type?: string; error?: string } {
  if (typeof window === 'undefined' || !window.location.hash) return {}
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return {
    accessToken: params.get('access_token') ?? undefined,
    type: params.get('type') ?? undefined,
    error: params.get('error_description') ?? params.get('error') ?? undefined,
  }
}

function safeReturnTo(requested: unknown): string {
  return typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : HOME
}

/**
 * Sign-in for self-hosted Studio (STUDIO_SELF_HOSTED_LOGIN=true): the same
 * screen as the hosted dashboard's sign-in. One form: an email address signs
 * in as an Auth user with Studio access, anything else is the gateway's
 * dashboard username. Links from the inbox (magic link, recovery) land here
 * too. Without the flag the page goes straight to the project, as upstream
 * does.
 */
export const SelfHostedSignInPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [methods, setMethods] = useState<SelfHostedLoginMethods>()
  const [passwordHidden, setPasswordHidden] = useState(true)
  const [error, setError] = useState<string>()
  const [linkPending, setLinkPending] = useState(false)
  const [sendingLink, setSendingLink] = useState(false)

  const returnTo = safeReturnTo(router.query.returnTo)

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '' },
  })
  const isSubmitting = form.formState.isSubmitting

  useEffect(() => {
    let cancelled = false
    fetchSelfHostedLoginStatus().then((status) => {
      if (cancelled) return
      if (!status.enabled) {
        router.replace(HOME)
        return
      }
      setMethods(status.methods)
    })
    return () => {
      cancelled = true
    }
  }, [router])

  // A magic link lands here with the token in the fragment; a recovery link
  // belongs on the reset page with the same fragment.
  useEffect(() => {
    if (!methods?.email) return
    const link = readLinkFragment()
    if (link.error) {
      setError(link.error)
      return
    }
    if (!link.accessToken) return
    if (link.type === 'recovery') {
      router.replace(`/reset-password${window.location.hash}`)
      return
    }
    setLinkPending(true)
    postJson(LOGIN_API, { accessToken: link.accessToken }).then((result) => {
      if (result.ok) {
        router.replace(returnTo)
        return
      }
      setLinkPending(false)
      setError(result.message)
    })
  }, [methods, returnTo, router])

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = async ({ identifier, password }) => {
    setError(undefined)
    const body =
      methods?.email && isEmail(identifier)
        ? { email: identifier, password }
        : { username: identifier, password }
    const result = await postJson(LOGIN_API, body)
    if (result.ok) {
      await router.replace(returnTo)
      return
    }
    setError(result.message)
  }

  const sendMagicLink = async () => {
    const email = form.getValues('identifier').trim()
    if (!z.string().email().safeParse(email).success) {
      form.setError('identifier', { message: 'Enter your email first' })
      return
    }
    setSendingLink(true)
    setError(undefined)
    const result = await postJson(MAGIC_LINK_API, { email })
    setSendingLink(false)
    if (result.ok) toast.success(`If ${email} has Studio access, a sign-in link is on its way`)
    else setError(result.message)
  }

  if (!methods) return null
  if (linkPending) {
    return <p className="text-sm text-foreground-light">Signing you in…</p>
  }

  const emailSignIn = methods.email

  return (
    <Form {...form}>
      <form method="POST" className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          key="identifier"
          name="identifier"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout
              label={emailSignIn ? 'Email or username' : 'Username'}
              description={
                emailSignIn
                  ? 'Your Studio account email, or the dashboard username from the gateway'
                  : undefined
              }
            >
              <FormControl>
                <Input
                  type="text"
                  autoComplete="username"
                  {...field}
                  placeholder={emailSignIn ? 'you@example.com' : 'supabase'}
                  autoFocus
                  disabled={isSubmitting}
                />
              </FormControl>
            </FormItemLayout>
          )}
        />
        <div className="relative">
          <FormField
            key="password"
            name="password"
            control={form.control}
            render={({ field }) => (
              <FormItemLayout label="Password">
                <div className="relative">
                  <FormControl>
                    <Input
                      type={passwordHidden ? 'password' : 'text'}
                      autoComplete="current-password"
                      {...field}
                      placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                      disabled={isSubmitting}
                      className="pr-10"
                    />
                  </FormControl>
                  <Button
                    type="button"
                    title={passwordHidden ? 'Show password' : 'Hide password'}
                    aria-label={passwordHidden ? 'Show password' : 'Hide password'}
                    className="absolute right-1 top-1 px-1.5"
                    icon={passwordHidden ? <Eye /> : <EyeOff />}
                    disabled={isSubmitting}
                    onClick={() => setPasswordHidden((prev) => !prev)}
                  />
                </div>
              </FormItemLayout>
            )}
          />
          {emailSignIn && (
            <Link
              href="/forgot-password"
              className="absolute top-0 right-0 text-sm text-foreground-lighter"
            >
              Forgot password?
            </Link>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="primary" block type="submit" size="large" loading={isSubmitting}>
          Sign in
        </Button>
        {emailSignIn && (
          <Button
            type="button"
            variant="text"
            block
            size="large"
            className="text-foreground-light"
            loading={sendingLink}
            disabled={isSubmitting}
            onClick={sendMagicLink}
          >
            Email me a sign-in link
          </Button>
        )}
      </form>
    </Form>
  )
}

SelfHostedSignInPage.getLayout = (page) => (
  <AuthenticationLayout>
    <SignInLayout
      heading="Welcome back"
      subheading="Sign in to Supabase Studio"
      logoLinkToMarketingSite={true}
      showDisclaimer={false}
    >
      {page}
    </SignInLayout>
  </AuthenticationLayout>
)
