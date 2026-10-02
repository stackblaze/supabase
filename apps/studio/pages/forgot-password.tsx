import Link from 'next/link'

import { ForgotPasswordWizard } from '@/components/interfaces/SignIn/ForgotPasswordWizard'
import { SelfHostedForgotPasswordPage } from '@/components/interfaces/SignIn/SelfHostedForgotPassword'
import { ForgotPasswordLayout } from '@/components/layouts/SignInLayout/ForgotPasswordLayout'
import { IS_PLATFORM } from '@/lib/constants'
import type { NextPageWithLayout } from '@/types'

const ForgotPasswordPage: NextPageWithLayout = () => {
  return (
    <>
      <div className="flex flex-col gap-4">
        <ForgotPasswordWizard />
      </div>

      <div className="my-8 self-center text-sm">
        <span className="text-foreground-light">Already have an account?</span>{' '}
        <Link href="/sign-in" className="underline hover:text-foreground-light">
          Sign in
        </Link>
      </div>
    </>
  )
}

ForgotPasswordPage.getLayout = (page) => (
  <ForgotPasswordLayout
    heading="Forgot your password?"
    subheading="Enter your email and we'll send you a code to reset the password"
  >
    {page}
  </ForgotPasswordLayout>
)

// Self-hosted Studio resets passwords through the deployment's own Auth.
export default IS_PLATFORM ? ForgotPasswordPage : SelfHostedForgotPasswordPage
