// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createSessionToken, SESSION_COOKIE } from './session'
import { selfHostedSignInGate } from './sign-in-gate'

const ENV = {
  NEXT_PUBLIC_IS_PLATFORM: 'false',
  STUDIO_SELF_HOSTED_LOGIN: 'true',
  DASHBOARD_USERNAME: 'admin',
  DASHBOARD_PASSWORD: 'test-password',
  PG_META_CRYPTO_KEY: 'test-key',
}

const saved: Record<string, string | undefined> = {}

const request = (path: string, cookie?: string) =>
  new Request(`http://studio.local${path}`, cookie ? { headers: { cookie } } : undefined)

describe('selfHostedSignInGate', () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key]
      process.env[key] = value
    }
  })

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  it('lets everything through when sign-in is off', async () => {
    process.env.STUDIO_SELF_HOSTED_LOGIN = 'false'
    expect(await selfHostedSignInGate(request('/project/default'), '')).toBeUndefined()
    expect(await selfHostedSignInGate(request('/api/platform/profile'), '')).toBeUndefined()
  })

  it('redirects pages to sign-in with a returnTo', async () => {
    const response = await selfHostedSignInGate(request('/project/default/editor?x=1'), '')
    expect(response?.status).toBe(307)
    // Relative, so a gateway's upstream host never leaks into the redirect.
    expect(response!.headers.get('location')).toMatch(/^\/sign-in\?/)
    const location = new URL(response!.headers.get('location')!, 'http://public.example')
    expect(location.pathname).toBe('/sign-in')
    expect(location.searchParams.get('returnTo')).toBe('/project/default/editor?x=1')
  })

  it('refuses API routes and server functions with 401', async () => {
    expect((await selfHostedSignInGate(request('/api/platform/profile'), ''))?.status).toBe(401)
    expect((await selfHostedSignInGate(request('/_serverFn/abc'), ''))?.status).toBe(401)
  })

  it('does not treat an API path ending in a file extension as a static file', async () => {
    const path = '/api/platform/projects/default/analytics/endpoints/logs.json'
    expect((await selfHostedSignInGate(request(path), ''))?.status).toBe(401)
  })

  it('leaves the sign-in screens, their API and static files open', async () => {
    for (const path of ['/sign-in', '/forgot-password', '/api/self-hosted/login', '/img/a.png']) {
      expect(await selfHostedSignInGate(request(path), '')).toBeUndefined()
    }
  })

  it('accepts a valid session cookie', async () => {
    const token = await createSessionToken({ kind: 'dashboard' })
    const cookie = `${SESSION_COOKIE}=${token}`
    expect(await selfHostedSignInGate(request('/project/default', cookie), '')).toBeUndefined()
    expect(await selfHostedSignInGate(request('/api/platform/profile', cookie), '')).toBeUndefined()
  })

  it('works under a base path', async () => {
    expect(await selfHostedSignInGate(request('/dashboard/sign-in'), '/dashboard')).toBeUndefined()
    const response = await selfHostedSignInGate(request('/dashboard/project/default'), '/dashboard')
    expect(response!.headers.get('location')).toBe(
      '/dashboard/sign-in?returnTo=%2Fproject%2Fdefault'
    )
  })
})
