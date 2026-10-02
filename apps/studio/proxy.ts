import { NextResponse, type NextRequest } from 'next/server'

import {
  selfHostedLoginEnabled,
  SESSION_COOKIE,
  verifySessionToken,
} from '@/lib/api/self-hosted/session'
import { IS_PLATFORM } from '@/lib/constants'
import { isHostedSupportedApiPath } from '@/lib/hosted-api-allowlist'

export const config = {
  // Everything but Next's own assets: the hosted allowlist concerns /api,
  // the self-hosted sign-in gate concerns every page and API route.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|img/|fonts/|monaco-editor/).*)'],
}

const OPEN_PATHS = new Set([
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/api/self-hosted/login',
  '/api/self-hosted/forgot-password',
  '/api/self-hosted/magic-link',
  '/api/self-hosted/reset-password',
])
const STATIC_FILE = /\.(?:png|svg|jpe?g|gif|ico|css|js|map|woff2?|ttf|txt|json|webmanifest)$/

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (IS_PLATFORM) {
    // Return 404 for all next.js API endpoints EXCEPT the ones we use in hosted.
    // The allowlist is shared with the TanStack guard (start.ts) — see
    // lib/hosted-api-allowlist.ts.
    if (pathname.startsWith('/api/') && !isHostedSupportedApiPath(pathname)) {
      return Response.json(
        { success: false, message: 'Endpoint not supported on hosted' },
        { status: 404 }
      )
    }
    return
  }

  // Self-hosted sign-in (STUDIO_SELF_HOSTED_LOGIN): everything needs the
  // session cookie except the sign-in page, its API and static files.
  if (!selfHostedLoginEnabled()) return
  if (OPEN_PATHS.has(pathname) || STATIC_FILE.test(pathname)) return
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return

  if (pathname.startsWith('/api/')) {
    return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 })
  }
  const signIn = request.nextUrl.clone()
  signIn.pathname = '/sign-in'
  signIn.search = ''
  const returnTo = `${pathname}${request.nextUrl.search}`
  if (returnTo !== '/') signIn.searchParams.set('returnTo', returnTo)
  return NextResponse.redirect(signIn)
}
