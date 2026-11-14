import { BASE_PATH } from '@/lib/constants'

/** Where self-hosted Studio opens after sign-in when no (safe) returnTo is given. */
export const SIGNED_IN_HOME = '/project/default'

const AUTH_PAGES = ['/sign-in', '/sign-out', '/forgot-password', '/reset-password']

/**
 * The page to open after sign-in: `requested` when it is a same-origin path that is not one of the
 * sign-in pages, else the default project. Rejects protocol-relative (`//host`, `/\host`) and
 * absolute URLs.
 */
export function safeReturnTo(requested: unknown, origin = 'http://studio.local'): string {
  if (typeof requested !== 'string' || !requested.startsWith('/')) return SIGNED_IN_HOME
  if (requested.startsWith('//') || requested.startsWith('/\\')) return SIGNED_IN_HOME
  let url: URL
  try {
    url = new URL(requested, origin)
  } catch {
    return SIGNED_IN_HOME
  }
  if (url.origin !== new URL(origin).origin) return SIGNED_IN_HOME
  if (AUTH_PAGES.includes(url.pathname)) return SIGNED_IN_HOME
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Open Studio after a successful sign-in with a full page load. Client state from before the
 * session existed (for example the profile request's cached 401, which sends people back to
 * /sign-in) must not carry over, so this is not a client-side route change.
 */
export function enterStudio(path: string) {
  window.location.assign(`${BASE_PATH}${safeReturnTo(path, window.location.origin)}`)
}
