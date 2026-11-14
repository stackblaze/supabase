import { createFileRoute } from '@tanstack/react-router'

import SignOutPage from '@/pages/sign-out'

// Self-hosted sign-out: no layout, the page clears the session and goes to sign-in.
export const Route = createFileRoute('/sign-out')({
  component: SignOut,
})

function SignOut() {
  return <SignOutPage dehydratedState={undefined} />
}
