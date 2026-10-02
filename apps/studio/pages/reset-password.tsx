import { ResetPasswordForm } from '@/components/interfaces/SignIn/ResetPasswordForm'
import { SelfHostedResetPasswordPage } from '@/components/interfaces/SignIn/SelfHostedResetPassword'
import { ForgotPasswordLayout } from '@/components/layouts/SignInLayout/ForgotPasswordLayout'
import { withAuth } from '@/hooks/misc/withAuth'
import { IS_PLATFORM } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const ResetPasswordPage: NextPageWithLayout = () => {
  return (
    <div className="flex flex-col gap-4">
      <ResetPasswordForm />
    </div>
  )
}

ResetPasswordPage.getLayout = (page) => (
  <ForgotPasswordLayout
    heading="Change your password"
    subheading="Welcome back! Choose a new strong password and save it to proceed"
  >
    {page}
  </ForgotPasswordLayout>
)

// Self-hosted Studio resets passwords through the deployment's own Auth.
export default IS_PLATFORM ? withAuth(ResetPasswordPage) : SelfHostedResetPasswordPage
