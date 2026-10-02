import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  authProviderConfigured,
  createStudioAdmin,
  findUserByEmail,
  isStudioAdmin,
  listStudioAdmins,
  setStudioAdmin,
  signInWithPassword,
} from './auth-provider'

const ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY']

type Call = { url: string; init: RequestInit }

function stubFetch(responder: (call: Call) => { status?: number; body?: unknown }) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: URL | string, init: RequestInit = {}) => {
      const call = { url: String(input), init }
      calls.push(call)
      const { status = 200, body = {} } = responder(call)
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    })
  )
  return calls
}

describe('self-hosted auth provider', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.SUPABASE_URL = 'http://kong'
    process.env.SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SERVICE_KEY = 'service'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('is configured only with the gateway URL and both keys', () => {
    expect(authProviderConfigured()).toBe(true)
    delete process.env.SUPABASE_SERVICE_KEY
    expect(authProviderConfigured()).toBe(false)
  })

  it('reads the admin flag from app_metadata only', () => {
    expect(isStudioAdmin({ id: '1', app_metadata: { studio_admin: true } })).toBe(true)
    expect(isStudioAdmin({ id: '1', app_metadata: { studio_admin: 'true' } })).toBe(false)
    expect(isStudioAdmin({ id: '1' })).toBe(false)
    expect(isStudioAdmin(undefined)).toBe(false)
  })

  it('signs in with the password grant using the anon key', async () => {
    const calls = stubFetch(() => ({
      body: { access_token: 't', user: { id: 'u1', email: 'a@b.c' } },
    }))
    const result = await signInWithPassword('a@b.c', 'pw')
    expect(result.data?.user.id).toBe('u1')
    expect(calls[0].url).toBe('http://kong/auth/v1/token?grant_type=password')
    expect(calls[0].init.method).toBe('POST')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer anon')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'a@b.c', password: 'pw' })
  })

  it('surfaces GoTrue error messages and unreachable Auth', async () => {
    stubFetch(() => ({ status: 400, body: { error_description: 'Invalid login credentials' } }))
    expect((await signInWithPassword('a@b.c', 'nope')).error).toEqual({
      status: 400,
      message: 'Invalid login credentials',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
    )
    expect((await signInWithPassword('a@b.c', 'pw')).error?.status).toBe(502)
  })

  it('lists and finds users through the admin API with the service key', async () => {
    const users = [
      { id: 'u1', email: 'Admin@Example.org', app_metadata: { studio_admin: true } },
      { id: 'u2', email: 'app-user@example.org', app_metadata: {} },
    ]
    const calls = stubFetch(() => ({ body: { users } }))
    expect((await listStudioAdmins()).data?.map((u) => u.id)).toEqual(['u1'])
    expect((await findUserByEmail('admin@example.org ')).data?.id).toBe('u1')
    expect((await findUserByEmail('nobody@example.org')).data).toBeUndefined()
    expect(calls[0].url).toBe('http://kong/auth/v1/admin/users?page=1&per_page=1000')
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Bearer service')
  })

  it('creates and flags admins with the service key', async () => {
    const calls = stubFetch(() => ({ body: { id: 'u9' } }))
    await createStudioAdmin('new@example.org')
    expect(calls[0].url).toBe('http://kong/auth/v1/admin/users')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      email: 'new@example.org',
      email_confirm: true,
      app_metadata: { studio_admin: true },
    })
    await setStudioAdmin('u2', false)
    expect(calls[1].url).toBe('http://kong/auth/v1/admin/users/u2')
    expect(calls[1].init.method).toBe('PUT')
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      app_metadata: { studio_admin: false },
    })
  })
})
