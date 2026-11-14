import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { executeQuery, isConnectionFailure } from './query'
import { PgMetaDatabaseError } from './types'

vi.mock('./util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./util')>()),
  assertSelfHosted: () => {},
  getConnectionString: () => 'postgres://user@db:5432/postgres',
  encryptString: (value: string) => `encrypted:${value}`,
}))

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const dbError = (code: string, status = 400) =>
  json({ message: `error ${code}`, code, formattedError: `error ${code}` }, status)
const refused = () =>
  Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })

describe('executeQuery retry', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries once when pg-meta refuses the connection', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce(json([{ ok: 1 }]))

    const result = await executeQuery({ query: 'select 1 as ok' })

    expect(result).toEqual({ data: [{ ok: 1 }], error: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries once on a terminated database connection (57P01)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(dbError('57P01', 500))
      .mockResolvedValueOnce(json([{ ok: 1 }]))

    const result = await executeQuery({ query: 'select 1 as ok' })

    expect(result.data).toEqual([{ ok: 1 }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after one retry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw refused()
    })

    await expect(executeQuery({ query: 'select 1' })).rejects.toThrow('fetch failed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry an error of the SQL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(dbError('42P01'))

    const result = await executeQuery({ query: 'select * from missing' })

    expect(result.error).toBeInstanceOf(PgMetaDatabaseError)
    expect((result.error as PgMetaDatabaseError).code).toBe('42P01')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('isConnectionFailure', () => {
  it('tells connection failures from SQL errors', () => {
    expect(isConnectionFailure(new PgMetaDatabaseError('x', '08006', 500, 'x'))).toBe(true)
    expect(isConnectionFailure(new PgMetaDatabaseError('x', '57P03', 500, 'x'))).toBe(true)
    expect(isConnectionFailure(new PgMetaDatabaseError('x', '23505', 400, 'x'))).toBe(false)
    expect(isConnectionFailure(refused())).toBe(true)
    expect(isConnectionFailure(new Error('something else'))).toBe(false)
  })
})
