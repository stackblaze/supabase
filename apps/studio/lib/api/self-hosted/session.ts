/**
 * Sign-in for self-hosted Studio: a username/password checked against
 * DASHBOARD_USERNAME / DASHBOARD_PASSWORD, kept as an HMAC-signed, expiring
 * cookie that proxy.ts verifies on every request. Enabled with
 * STUDIO_SELF_HOSTED_LOGIN=true. Web Crypto only, so the same code runs in
 * API routes and in the request proxy.
 */
export const SESSION_COOKIE = 'sb_studio_session'
export const SESSION_TTL_SECONDS = 12 * 60 * 60

export function selfHostedLoginEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_IS_PLATFORM !== 'true' &&
    process.env.STUDIO_SELF_HOSTED_LOGIN === 'true' &&
    !!process.env.DASHBOARD_USERNAME &&
    !!process.env.DASHBOARD_PASSWORD
  )
}

// Tied to the password so changing it signs everyone out.
function secretBytes(): BufferSource {
  return new TextEncoder().encode(
    `${process.env.DASHBOARD_PASSWORD ?? ''}:${process.env.PG_META_CRYPTO_KEY ?? ''}`
  )
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes(),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function credentialsMatch(username: string, password: string): boolean {
  return (
    constantTimeEqual(username, process.env.DASHBOARD_USERNAME ?? '') &&
    constantTimeEqual(password, process.env.DASHBOARD_PASSWORD ?? '')
  )
}

/** `<expiry unix seconds>.<hmac>` */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const exp = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS)
  return `${exp}.${await hmacHex(exp)}`
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now()
): Promise<boolean> {
  if (!token) return false
  const [exp, signature] = token.split('.')
  if (!exp || !signature || !/^\d+$/.test(exp)) return false
  if (Number(exp) * 1000 < now) return false
  return constantTimeEqual(signature, await hmacHex(exp))
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}
