import { createFileRoute } from '@tanstack/react-router'

import { SelfHostedSignInPage } from '@/components/interfaces/SignIn/SelfHostedSignIn'
import { AuthenticationLayout } from '@/components/layouts/AuthenticationLayout'
import { SignInLayout } from '@/components/layouts/SignInLayout/SignInLayout'
import { IS_PLATFORM } from '@/lib/constants'
import { buildStudioPageTitle } from '@/lib/page-title'
import SignInPage from '@/pages/sign-in'

const PAGE_TITLE = buildStudioPageTitle({ section: 'Sign in', brand: 'Supabase Dashboard' })
const PAGE_DESCRIPTION =
  'Sign into the Supabase dashboard. Build production-grade applications with a Postgres database, Authentication, instant APIs, Realtime, Functions, Storage and Vector embeddings.'

export const Route = createFileRoute('/_auth/sign-in')({
  head: () => ({
    meta: [{ title: PAGE_TITLE }, { name: 'description', content: PAGE_DESCRIPTION }],
  }),
  component: SignIn,
})

function SignIn() {
  // Self-hosted Studio has its own sign-in screens, laid out by the page itself.
  if (!IS_PLATFORM)
    return SelfHostedSignInPage.getLayout!(<SelfHostedSignInPage dehydratedState={undefined} />)

  return (
    <AuthenticationLayout>
      <SignInLayout
        heading="Welcome back"
        subheading="Sign in to your account"
        logoLinkToMarketingSite={true}
        inboundFlow="sign-in"
        hasStatusBanner
      >
        <SignInPage dehydratedState={undefined} />
      </SignInLayout>
    </AuthenticationLayout>
  )
}
