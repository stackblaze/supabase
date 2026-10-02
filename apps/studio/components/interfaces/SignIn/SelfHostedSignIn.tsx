import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { Button, Form, FormControl, FormField, Input } from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import z from 'zod'

import { AuthenticationLayout } from '@/components/layouts/AuthenticationLayout'
import { SignInLayout } from '@/components/layouts/SignInLayout/SignInLayout'
import { BASE_PATH } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const LOGIN_API = `${BASE_PATH}/api/self-hosted/login`
const HOME = '/project/default'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

/**
 * Sign-in for self-hosted Studio (STUDIO_SELF_HOSTED_LOGIN=true): the same
 * screen as the hosted dashboard's sign-in, with a username/password form
 * checked against DASHBOARD_USERNAME / DASHBOARD_PASSWORD. Without the flag
 * it behaves as before and goes straight to the project.
 */
export const SelfHostedSignInPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  const [passwordHidden, setPasswordHidden] = useState(true)
  const [error, setError] = useState<string>()

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  })
  const isSubmitting = form.formState.isSubmitting

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

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = async ({ username, password }) => {
    setError(undefined)
    const res = await fetch(LOGIN_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).catch(() => undefined)
    if (res?.ok) {
      await router.replace(returnTo)
      return
    }
    setError(
      res?.status === 401 ? 'Invalid username or password' : 'Sign-in failed, please try again'
    )
  }

  if (!enabled) return null

  return (
    <Form {...form}>
      <form method="POST" className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          key="username"
          name="username"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout label="Username">
              <FormControl>
                <Input
                  type="text"
                  autoComplete="username"
                  {...field}
                  placeholder="supabase"
                  autoFocus
                  disabled={isSubmitting}
                />
              </FormControl>
            </FormItemLayout>
          )}
        />

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

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button variant="primary" block type="submit" size="large" loading={isSubmitting}>
          Sign in
        </Button>
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
    >
      {page}
    </SignInLayout>
  </AuthenticationLayout>
)
