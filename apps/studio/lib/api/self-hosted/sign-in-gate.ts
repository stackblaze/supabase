import {
  selfHostedLoginEnabled,
  SESSION_COOKIE,
  verifySessionToken,
} from '@/lib/api/self-hosted/session'

// Paths reachable without a session, relative to the base path.
const OPEN_PATHS = new Set([
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/api/self-hosted/login',
  '/api/self-hosted/forgot-password',
  '/api/self-hosted/magic-link',
  '/api/self-hosted/reset-password',
])
const STATIC_FILE =
  /\.(?:png|svg|jpe?g|gif|ico|css|js|mjs|map|woff2?|ttf|txt|json|webmanifest|wasm)$/

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq < 0 || trimmed.slice(0, eq) !== name) continue
    const value = trimmed.slice(eq + 1)
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
}

/**
 * Self-hosted sign-in gate (STUDIO_SELF_HOSTED_LOGIN). Returns the response that
 * refuses the request (401 for API routes and server functions, a redirect to
 * sign-in for pages), or undefined when the request may go on.
 */
export async function selfHostedSignInGate(
  request: Request,
  basePath: string
): Promise<Response | undefined> {
  if (!selfHostedLoginEnabled()) return

  const url = new URL(request.url)
  const pathname =
    basePath && url.pathname.startsWith(basePath)
      ? url.pathname.slice(basePath.length) || '/'
      : url.pathname

  // API routes and server functions never count as static files: a dynamic segment such as
  // `endpoints/$name` can end in `.json` and must still need the session.
  const isApi = pathname.startsWith('/api/') || pathname.startsWith('/_serverFn')
  if (OPEN_PATHS.has(pathname) || (!isApi && STATIC_FILE.test(pathname))) return
  if (await verifySessionToken(readCookie(request.headers.get('cookie'), SESSION_COOKIE))) return

  if (isApi) {
    return Response.json({ error: { message: 'Unauthorized' } }, { status: 401 })
  }

  const signIn = new URL(`${basePath}/sign-in`, url)
  const returnTo = `${pathname}${url.search}`
  if (returnTo !== '/') signIn.searchParams.set('returnTo', returnTo)
  return Response.redirect(signIn, 307)
}
