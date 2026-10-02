/**
 * The deployment's own Auth (GoTrue) as the identity provider for self-hosted
 * Studio sign-in. Every call goes server-side through the gateway
 * (SUPABASE_URL) with the deployment's keys; the browser never talks to Auth
 * directly. Studio access is the `studio_admin` flag in a user's app_metadata,
 * which only the service key can set.
 */
const STUDIO_ADMIN_FLAG = 'studio_admin'

export type AuthUser = {
  id: string
  email?: string
  app_metadata?: Record<string, unknown>
  created_at?: string
  last_sign_in_at?: string | null
  email_confirmed_at?: string | null
}

type AuthError = { status: number; message: string }
type AuthResult<T> = { data: T; error?: undefined } | { data?: undefined; error: AuthError }

const authUrl = () => `${process.env.SUPABASE_URL ?? ''}/auth/v1`
const anonKey = () => process.env.SUPABASE_ANON_KEY ?? ''
const serviceKey = () => process.env.SUPABASE_SERVICE_KEY ?? ''

export function authProviderConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!anonKey() && !!serviceKey()
}

export const isStudioAdmin = (user: AuthUser | undefined): boolean =>
  user?.app_metadata?.[STUDIO_ADMIN_FLAG] === true

type CallInit = {
  method?: 'GET' | 'POST' | 'PUT'
  /** Bearer token; defaults to the anon key (user-facing endpoints). */
  token?: string
  body?: unknown
  query?: Record<string, string>
}

async function call<T>(path: string, init: CallInit = {}): Promise<AuthResult<T>> {
  const url = new URL(`${authUrl()}${path}`)
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value)

  let response: Response
  try {
    response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        apikey: anonKey(),
        Authorization: `Bearer ${init.token ?? anonKey()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auth is unreachable'
    return { error: { status: 502, message } }
  }

  const text = await response.text()
  let json: Record<string, unknown> | undefined
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : undefined
  } catch {
    json = undefined
  }

  if (!response.ok) {
    const message = [json?.msg, json?.error_description, json?.message, json?.error].find(
      (candidate): candidate is string => typeof candidate === 'string'
    )
    return { error: { status: response.status, message: message ?? response.statusText } }
  }
  return { data: (json ?? {}) as T }
}

export const signInWithPassword = (email: string, password: string) =>
  call<{ access_token: string; user: AuthUser }>('/token', {
    method: 'POST',
    query: { grant_type: 'password' },
    body: { email, password },
  })

/** The user behind an access token, e.g. one that arrived through an email link. */
export const userFromAccessToken = (accessToken: string) =>
  call<AuthUser>('/user', { token: accessToken })

export const updatePassword = (accessToken: string, password: string) =>
  call<AuthUser>('/user', { method: 'PUT', token: accessToken, body: { password } })

export const sendRecoveryEmail = (email: string, redirectTo: string) =>
  call<Record<string, never>>('/recover', {
    method: 'POST',
    query: { redirect_to: redirectTo },
    body: { email },
  })

export const sendMagicLink = (email: string, redirectTo: string) =>
  call<Record<string, never>>('/otp', {
    method: 'POST',
    query: { redirect_to: redirectTo },
    body: { email, create_user: false },
  })

const PAGE_SIZE = 1000
const MAX_PAGES = 10

async function listUsers(): Promise<AuthResult<AuthUser[]>> {
  const users: AuthUser[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await call<{ users?: AuthUser[] }>('/admin/users', {
      token: serviceKey(),
      query: { page: String(page), per_page: String(PAGE_SIZE) },
    })
    if (result.error) return result
    const batch = result.data.users ?? []
    users.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return { data: users }
}

export async function listStudioAdmins(): Promise<AuthResult<AuthUser[]>> {
  const all = await listUsers()
  return all.error ? all : { data: all.data.filter(isStudioAdmin) }
}

export async function findUserByEmail(email: string): Promise<AuthResult<AuthUser | undefined>> {
  const all = await listUsers()
  if (all.error) return all
  const wanted = email.trim().toLowerCase()
  return { data: all.data.find((user) => (user.email ?? '').toLowerCase() === wanted) }
}

/** Flags (or unflags) an existing user; a password, when given, replaces theirs. */
export const setStudioAdmin = (userId: string, on: boolean, password?: string) =>
  call<AuthUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    token: serviceKey(),
    body: { app_metadata: { [STUDIO_ADMIN_FLAG]: on }, ...(password ? { password } : {}) },
  })

/** A new, confirmed user with Studio access; without a password they sign in via email link. */
export const createStudioAdmin = (email: string, password?: string) =>
  call<AuthUser>('/admin/users', {
    method: 'POST',
    token: serviceKey(),
    body: {
      email,
      email_confirm: true,
      app_metadata: { [STUDIO_ADMIN_FLAG]: true },
      ...(password ? { password } : {}),
    },
  })
