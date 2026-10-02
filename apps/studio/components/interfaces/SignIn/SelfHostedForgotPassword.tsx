import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { Button, Form, FormControl, FormField, Input } from 'ui'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import z from 'zod'

import { ForgotPasswordLayout } from '@/components/layouts/SignInLayout/ForgotPasswordLayout'
import { fetchSelfHostedLoginStatus } from '@/hooks/misc/useSelfHostedLoginEnabled'
import { BASE_PATH } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const schema = z.object({ email: z.string().email('Enter a valid email') })

/** Self-hosted: emails a reset link through the deployment's own Auth. */
export const SelfHostedForgotPasswordPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  useEffect(() => {
    let cancelled = false
    fetchSelfHostedLoginStatus().then((status) => {
      if (cancelled) return
      if (!status.methods.email) router.replace('/sign-in')
      else setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [router])

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = async ({ email }) => {
    setError(undefined)
    const res = await fetch(`${BASE_PATH}/api/self-hosted/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => undefined)
    if (res?.ok) {
      setSentTo(email.trim())
      return
    }
    const message = await res
      ?.json()
      .then((json: { error?: { message?: string } }) => json?.error?.message)
      .catch(() => undefined)
    setError(message ?? 'Could not send the email, please try again')
  }

  if (!ready) return null

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4 text-sm text-foreground-light">
        <p>
          If <span className="text-foreground">{sentTo}</span> has Studio access, a link to choose a
          new password is on its way. It is valid for a limited time.
        </p>
        <Link href="/sign-in" className="underline transition hover:text-foreground">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form method="POST" className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          key="email"
          name="email"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout label="Email">
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  {...field}
                  placeholder="you@example.com"
                  autoFocus
                  disabled={form.formState.isSubmitting}
                />
              </FormControl>
            </FormItemLayout>
          )}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          block
          type="submit"
          size="large"
          loading={form.formState.isSubmitting}
        >
          Send reset link
        </Button>
        <Link
          href="/sign-in"
          className="self-center text-sm text-foreground-light underline transition hover:text-foreground"
        >
          Back to sign in
        </Link>
      </form>
    </Form>
  )
}

SelfHostedForgotPasswordPage.getLayout = (page) => (
  <ForgotPasswordLayout
    heading="Forgot your password?"
    subheading="Enter your email and we'll send you a link to choose a new one"
    logoLinkToMarketingSite={true}
  >
    {page}
  </ForgotPasswordLayout>
)
