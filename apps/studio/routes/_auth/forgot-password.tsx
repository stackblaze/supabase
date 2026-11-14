import { createFileRoute } from '@tanstack/react-router'

import { SelfHostedForgotPasswordPage } from '@/components/interfaces/SignIn/SelfHostedForgotPassword'
import { ForgotPasswordLayout } from '@/components/layouts/SignInLayout/ForgotPasswordLayout'
import { IS_PLATFORM } from '@/lib/constants'
import { buildStudioPageTitle } from '@/lib/page-title'
import ForgotPasswordPage from '@/pages/forgot-password'

const PAGE_TITLE = buildStudioPageTitle({ section: 'Forgot password', brand: 'Supabase Dashboard' })

export const Route = createFileRoute('/_auth/forgot-password')({
  head: () => ({ meta: [{ title: PAGE_TITLE }] }),
  component: ForgotPassword,
})

function ForgotPassword() {
  // Self-hosted Studio has its own sign-in screens, laid out by the page itself.
  if (!IS_PLATFORM)
    return SelfHostedForgotPasswordPage.getLayout!(
      <SelfHostedForgotPasswordPage dehydratedState={undefined} />
    )

  return (
    <ForgotPasswordLayout
      heading="Forgot your password?"
      subheading="Enter your email and we'll send you a code to reset the password"
    >
      <ForgotPasswordPage dehydratedState={undefined} />
    </ForgotPasswordLayout>
  )
}
