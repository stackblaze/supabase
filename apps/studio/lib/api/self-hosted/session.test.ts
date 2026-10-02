import { webcrypto } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createSessionToken,
  credentialsMatch,
  selfHostedLoginEnabled,
  SESSION_TTL_SECONDS,
  verifySessionToken,
} from './session'

const ENV = [
  'NEXT_PUBLIC_IS_PLATFORM',
  'STUDIO_SELF_HOSTED_LOGIN',
  'DASHBOARD_USERNAME',
  'DASHBOARD_PASSWORD',
  'PG_META_CRYPTO_KEY',
]

// jsdom has no SubtleCrypto; the code under test only uses Web Crypto.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto)
})

describe('self-hosted sign-in session', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    delete process.env.NEXT_PUBLIC_IS_PLATFORM
    process.env.STUDIO_SELF_HOSTED_LOGIN = 'true'
    process.env.DASHBOARD_USERNAME = 'supabase'
    process.env.DASHBOARD_PASSWORD = 'correct horse battery staple'
    process.env.PG_META_CRYPTO_KEY = 'k'
  })

  afterEach(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('is enabled only with the flag and both credentials, never on the platform', () => {
    expect(selfHostedLoginEnabled()).toBe(true)
    process.env.NEXT_PUBLIC_IS_PLATFORM = 'true'
    expect(selfHostedLoginEnabled()).toBe(false)
    delete process.env.NEXT_PUBLIC_IS_PLATFORM
    delete process.env.DASHBOARD_PASSWORD
    expect(selfHostedLoginEnabled()).toBe(false)
  })

  it('checks credentials exactly', () => {
    expect(credentialsMatch('supabase', 'correct horse battery staple')).toBe(true)
    expect(credentialsMatch('supabase', 'correct horse battery stapl')).toBe(false)
    expect(credentialsMatch('Supabase', 'correct horse battery staple')).toBe(false)
  })

  it('issues a token that verifies until it expires and not after', async () => {
    const now = Date.now()
    const token = await createSessionToken(now)
    expect(await verifySessionToken(token, now)).toBe(true)
    expect(await verifySessionToken(token, now + (SESSION_TTL_SECONDS - 1) * 1000)).toBe(true)
    expect(await verifySessionToken(token, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false)
  })

  it('rejects tampered, foreign and missing tokens', async () => {
    const token = await createSessionToken()
    const [exp, sig] = token.split('.')
    expect(await verifySessionToken(`${Number(exp) + 3600}.${sig}`)).toBe(false)
    expect(
      await verifySessionToken(`${exp}.${sig.replace(/^./, (c) => (c === '0' ? '1' : '0'))}`)
    ).toBe(false)
    expect(await verifySessionToken(undefined)).toBe(false)
    expect(await verifySessionToken('garbage')).toBe(false)
    process.env.DASHBOARD_PASSWORD = 'rotated'
    expect(await verifySessionToken(token)).toBe(false)
  })
})
