import { createFileRoute } from '@tanstack/react-router'

import { SelfHostedResetPasswordPage } from '@/components/interfaces/SignIn/SelfHostedResetPassword'
import { ForgotPasswordLayout } from '@/components/layouts/SignInLayout/ForgotPasswordLayout'
import { IS_PLATFORM } from '@/lib/constants'
import ResetPasswordPage from '@/pages/reset-password'

export const Route = createFileRoute('/_auth/reset-password')({
  component: ResetPassword,
})

function ResetPassword() {
  // Self-hosted Studio has its own sign-in screens, laid out by the page itself.
  if (!IS_PLATFORM)
    return SelfHostedResetPasswordPage.getLayout!(
      <SelfHostedResetPasswordPage dehydratedState={undefined} />
    )

  // Next page default export is already wrapped in withAuth — session guard runs inline.
  return (
    <ForgotPasswordLayout
      heading="Change your password"
      subheading="Welcome back! Choose a new strong password and save it to proceed"
    >
      <ResetPasswordPage dehydratedState={undefined} />
    </ForgotPasswordLayout>
  )
}
