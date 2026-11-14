import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createMiddleware, createStart } from '@tanstack/react-start'

import { selfHostedSignInGate } from '@/lib/api/self-hosted/sign-in-gate'
import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'
import { isHostedSupportedApiPath } from '@/lib/hosted-api-allowlist'

// Self-hosted-only API routes must 404 in platform (hosted) mode. Under the
// Next pages router this lives in middleware (proxy.ts); TanStack Start has no
// middleware runtime, so it's a global request middleware sharing the same
// allowlist (lib/hosted-api-allowlist.ts). On Vercel every `/api/*` request
// still reaches the function (pages are a static shell), so this covers all
// API routes from one place.

const platformApiGuard = createMiddleware({ type: 'request' }).server(({ request, next }) => {
  const { pathname } = new URL(request.url)
  // Path relative to the configured basePath — mirrors Next's basePath-
  // relative middleware matcher.
  const relativePath =
    BASE_PATH && pathname.startsWith(BASE_PATH) ? pathname.slice(BASE_PATH.length) : pathname

  if (IS_PLATFORM && relativePath.startsWith('/api/') && !isHostedSupportedApiPath(relativePath)) {
    return Response.json(
      { success: false, message: 'Endpoint not supported on hosted' },
      { status: 404 }
    )
  }

  return next()
})

// Self-hosted sign-in (STUDIO_SELF_HOSTED_LOGIN): every page, API route and
// server function needs the session cookie, except the sign-in screens, their
// API and static files. Under Next this lived in proxy.ts.
const selfHostedSignInGuard = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    if (IS_PLATFORM) return next()
    const denied = await selfHostedSignInGate(request, BASE_PATH)
    return denied ?? next()
  }
)

// Vercel's standard request pin keeps server functions compatible with the
// current tab. Documents and the deployment check stay unpinned, so a reload
// gets the latest version. Vite only defines the ID when protection is enabled.
const deploymentMiddleware = createMiddleware({ type: 'function' }).client(({ next }) => {
  const deploymentId = process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID
  return next({ headers: deploymentId ? { 'x-deployment-id': deploymentId } : {} })
})

// Sentry's global middlewares go at the FRONT so they wrap the whole request /
// server-function lifecycle — including errors that downstream code swallows
// into a 500, which the manual `@sentry/nextjs` approach never sees. The SDK's
// Vite plugin can auto-wrap these arrays instead, but we disable that
// (`autoInstrumentMiddleware: false` in vite.config.ts) and wire them
// explicitly so the instrumentation is visible in source.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, platformApiGuard, selfHostedSignInGuard],
  functionMiddleware: [sentryGlobalFunctionMiddleware, deploymentMiddleware],
}))
