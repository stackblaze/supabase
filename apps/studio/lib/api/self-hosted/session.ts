/**
 * Sign-in for self-hosted Studio: an identity kept as an HMAC-signed,
 * expiring cookie that proxy.ts verifies on every request. Enabled with
 * STUDIO_SELF_HOSTED_LOGIN=true. The identity is either the gateway's
 * dashboard credential (DASHBOARD_USERNAME / DASHBOARD_PASSWORD) or an Auth
 * user flagged as a Studio admin (see auth-provider.ts). Web Crypto only, so
 * the same code runs in API routes and in the request proxy.
 */
export const SESSION_COOKIE = 'sb_studio_session'
export const SESSION_TTL_SECONDS = 12 * 60 * 60

export type SessionIdentity = { kind: 'dashboard' } | { kind: 'user'; sub: string; email: string }

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

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | undefined {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return undefined
  }
}

function parseIdentity(json: string | undefined): SessionIdentity | undefined {
  if (!json) return undefined
  try {
    const value = JSON.parse(json) as Partial<SessionIdentity> | null
    if (value?.kind === 'dashboard') return { kind: 'dashboard' }
    if (
      value?.kind === 'user' &&
      typeof value.sub === 'string' &&
      typeof value.email === 'string'
    ) {
      return { kind: 'user', sub: value.sub, email: value.email }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** `<expiry unix seconds>.<base64url identity>.<hmac>` */
export async function createSessionToken(
  identity: SessionIdentity = { kind: 'dashboard' },
  now = Date.now()
): Promise<string> {
  const exp = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS)
  const payload = toBase64Url(JSON.stringify(identity))
  return `${exp}.${payload}.${await hmacHex(`${exp}.${payload}`)}`
}

/** The identity behind a token, or undefined when it is missing, expired or forged. */
export async function readSessionToken(
  token: string | undefined,
  now = Date.now()
): Promise<SessionIdentity | undefined> {
  if (!token) return undefined
  const [exp, payload, signature] = token.split('.')
  if (!exp || !payload || !signature || !/^\d+$/.test(exp)) return undefined
  if (Number(exp) * 1000 < now) return undefined
  if (!constantTimeEqual(signature, await hmacHex(`${exp}.${payload}`))) return undefined
  return parseIdentity(fromBase64Url(payload))
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now()
): Promise<boolean> {
  return (await readSessionToken(token, now)) !== undefined
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}
