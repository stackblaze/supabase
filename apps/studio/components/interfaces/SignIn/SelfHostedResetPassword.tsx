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

import { ForgotPasswordLayout } from '@/components/layouts/SignInLayout/ForgotPasswordLayout'
import { fetchSelfHostedLoginStatus } from '@/hooks/misc/useSelfHostedLoginEnabled'
import { BASE_PATH } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const MIN_LENGTH = 8
const schema = z
  .object({
    password: z.string().min(MIN_LENGTH, `At least ${MIN_LENGTH} characters`),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'The passwords do not match',
    path: ['confirm'],
  })

/** Self-hosted: the recovery link lands here with the token in the fragment. */
export const SelfHostedResetPasswordPage: NextPageWithLayout = () => {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [accessToken, setAccessToken] = useState<string>()
  const [linkError, setLinkError] = useState<string>()
  const [error, setError] = useState<string>()
  const [hidden, setHidden] = useState(true)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  useEffect(() => {
    let cancelled = false
    fetchSelfHostedLoginStatus().then((status) => {
      if (cancelled) return
      if (!status.methods.email) {
        router.replace('/sign-in')
        return
      }
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const token = params.get('access_token')
      const described = params.get('error_description') ?? params.get('error')
      if (token) setAccessToken(token)
      else setLinkError(described ?? 'This link is invalid or has expired')
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [router])

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = async ({ password }) => {
    setError(undefined)
    const res = await fetch(`${BASE_PATH}/api/self-hosted/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accessToken, password }),
    }).catch(() => undefined)
    if (res?.ok) {
      const { signedIn } = (await res.json().catch(() => ({}))) as { signedIn?: boolean }
      toast.success('Password updated')
      await router.replace(signedIn ? '/project/default' : '/sign-in')
      return
    }
    const message = await res
      ?.json()
      .then((json: { error?: { message?: string } }) => json?.error?.message)
      .catch(() => undefined)
    setError(message ?? 'Could not update the password, please try again')
  }

  if (!ready) return null

  if (linkError) {
    return (
      <div className="flex flex-col gap-4 text-sm text-foreground-light">
        <p role="alert" className="text-destructive">
          {linkError}
        </p>
        <Link href="/forgot-password" className="underline transition hover:text-foreground">
          Request a new link
        </Link>
      </div>
    )
  }

  const toggle = (
    <Button
      type="button"
      title={hidden ? 'Show password' : 'Hide password'}
      aria-label={hidden ? 'Show password' : 'Hide password'}
      className="absolute right-1 top-1 px-1.5"
      icon={hidden ? <Eye /> : <EyeOff />}
      onClick={() => setHidden((prev) => !prev)}
    />
  )

  return (
    <Form {...form}>
      <form method="POST" className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          key="password"
          name="password"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout label="New password">
              <div className="relative">
                <FormControl>
                  <Input
                    type={hidden ? 'password' : 'text'}
                    autoComplete="new-password"
                    {...field}
                    autoFocus
                    disabled={form.formState.isSubmitting}
                    className="pr-10"
                  />
                </FormControl>
                {toggle}
              </div>
            </FormItemLayout>
          )}
        />
        <FormField
          key="confirm"
          name="confirm"
          control={form.control}
          render={({ field }) => (
            <FormItemLayout label="Confirm password">
              <FormControl>
                <Input
                  type={hidden ? 'password' : 'text'}
                  autoComplete="new-password"
                  {...field}
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
          Save new password
        </Button>
      </form>
    </Form>
  )
}

SelfHostedResetPasswordPage.getLayout = (page) => (
  <ForgotPasswordLayout
    heading="Choose a new password"
    subheading="Pick a strong password for your Studio account"
    logoLinkToMarketingSite={true}
  >
    {page}
  </ForgotPasswordLayout>
)
