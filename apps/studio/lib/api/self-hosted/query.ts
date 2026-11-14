import * as Sentry from '@sentry/nextjs'

import { constructHeaders } from '../apiHelpers'
import { databaseErrorSchema, PgMetaDatabaseError, WrappedResult } from './types'
import { assertSelfHosted, encryptString, getConnectionString } from './util'
import { PG_META_URL } from '@/lib/constants/index'

export type QueryOptions = {
  query: string
  parameters?: unknown[]
  readOnly?: boolean
  headers?: HeadersInit
}

/**
 * Executes a SQL query against the self-hosted Postgres instance via pg-meta service.
 *
 * _Only call this from server-side self-hosted code._
 */
export async function executeQuery<T = unknown>({
  query,
  parameters,
  readOnly = false,
  headers,
}: QueryOptions): Promise<WrappedResult<T[]>> {
  assertSelfHosted()

  const connectionString = getConnectionString({ readOnly })
  const connectionStringEncrypted = encryptString(connectionString)

  const requestBody: { query: string; parameters?: unknown[] } = { query }
  if (parameters !== undefined) {
    requestBody.parameters = parameters
  }

  const attempt = () =>
    Sentry.startSpan({ name: 'pg-meta.query', op: 'db.query' }, async (span) => {
      const response = await fetch(`${PG_META_URL}/query`, {
        method: 'POST',
        headers: constructHeaders({
          ...headers,
          'Content-Type': 'application/json',
          'x-connection-encrypted': connectionStringEncrypted,
        }),
        body: JSON.stringify(requestBody),
      })

      try {
        const result = await response.json()

        if (!response.ok) {
          const { message, code, formattedError } = databaseErrorSchema.parse(result)
          span.setAttribute('db.error', 1)
          span.setAttribute('db.status_code', response.status)
          const error = new PgMetaDatabaseError(message, code, response.status, formattedError)
          return { data: undefined, error }
        }

        span.setAttribute('db.status_code', response.status)
        return { data: result as T[], error: undefined }
      } catch (error) {
        span.setAttribute('db.error', 1)
        if (error instanceof Error) {
          return { data: undefined, error }
        }
        throw error
      }
    })

  // Right after the database or pg-meta restarts (for example once a backup restore has brought
  // the project back), the first query can hit a refused or terminated connection. Retry those
  // once; never retry an error of the SQL itself.
  let first: WrappedResult<T[]>
  try {
    first = await attempt()
  } catch (error) {
    if (!isConnectionFailure(error)) throw error
    await sleep(RETRY_DELAY_MS)
    return await attempt()
  }
  if (first.error && isConnectionFailure(first.error)) {
    await sleep(RETRY_DELAY_MS)
    return await attempt()
  }
  return first
}

const RETRY_DELAY_MS = 750

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Postgres and Node codes of a connection that was refused, reset or terminated, as opposed to
 * an error of the SQL: 57P01 admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now,
 * class 08 connection exceptions.
 */
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  '57P01',
  '57P02',
  '57P03',
])

/** A refused, reset or terminated connection to pg-meta or the database, worth one retry. */
export function isConnectionFailure(error: unknown): boolean {
  if (error instanceof PgMetaDatabaseError) {
    return CONNECTION_ERROR_CODES.has(error.code) || error.code.startsWith('08')
  }
  // fetch() to pg-meta failed before any response (pg-meta not up yet): Node's fetch throws a
  // TypeError whose cause carries the socket error code.
  if (error instanceof TypeError) {
    const code = (error.cause as { code?: unknown } | undefined)?.code
    return (
      typeof code !== 'string' || CONNECTION_ERROR_CODES.has(code) || code.startsWith('UND_ERR')
    )
  }
  return false
}
