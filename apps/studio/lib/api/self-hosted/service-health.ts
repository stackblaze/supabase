import { retrieveAnalyticsData } from './logs'
import { WrappedResult } from './types'

type Counts = { ok: number; warning: number; error: number; total: number }
type ServiceHealthRow = { timestamp: string } & Record<string, Counts | string>

const STATUS_ERROR = 'response.status_code >= 500'
const STATUS_WARNING = 'response.status_code >= 400 AND response.status_code < 500'
const EDGE_JOINS = `cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response`

/**
 * What counts as an error or a warning per service, as in the Logs pages' charts.
 * Edge Functions health comes from the gateway's requests to /functions/v1, since the
 * function runtime's own log lines carry no status.
 */
const SERVICES: Record<
  string,
  { table: string; joins?: string; where?: string; error: string; warning: string }
> = {
  edge_logs: {
    table: 'edge_logs',
    joins: EDGE_JOINS,
    error: STATUS_ERROR,
    warning: STATUS_WARNING,
  },
  function_edge_logs: {
    table: 'edge_logs',
    joins: EDGE_JOINS,
    where: `request.path like '/functions/v1/%'`,
    error: STATUS_ERROR,
    warning: STATUS_WARNING,
  },
  postgres_logs: {
    table: 'postgres_logs',
    joins: `cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed`,
    error: `parsed.error_severity IN ('ERROR', 'FATAL', 'PANIC')`,
    warning: `parsed.error_severity IN ('WARNING')`,
  },
  auth_logs: {
    table: 'auth_logs',
    joins: 'cross join unnest(metadata) as metadata',
    error: `IFNULL(metadata.level, '') IN ('error', 'fatal') OR IFNULL(SAFE_CAST(metadata.status AS INT64), 0) >= 500`,
    warning: `IFNULL(metadata.level, '') = 'warning' OR IFNULL(SAFE_CAST(metadata.status AS INT64), 0) BETWEEN 400 AND 499`,
  },
  postgrest_logs: { table: 'postgrest_logs', error: 'false', warning: 'false' },
  storage_logs: { table: 'storage_logs', error: 'false', warning: 'false' },
  realtime_logs: { table: 'realtime_logs', error: 'false', warning: 'false' },
}

const GRANULARITIES = ['minute', 'hour', 'day']
const EMPTY: Counts = { ok: 0, warning: 0, error: 0, total: 0 }

const serviceSql = (
  service: (typeof SERVICES)[string],
  granularity: string,
  start: string
) => `SELECT
  timestamp_trunc(t.timestamp, ${granularity}) as timestamp,
  count(CASE WHEN NOT (${service.error} OR ${service.warning}) THEN 1 END) as ok_count,
  count(CASE WHEN ${service.error} THEN 1 END) as error_count,
  count(CASE WHEN ${service.warning} THEN 1 END) as warning_count,
FROM
  ${service.table} t
  ${service.joins ?? ''}
  where t.timestamp > '${start}'${service.where ? ` and ${service.where}` : ''}
GROUP BY
timestamp
ORDER BY
  timestamp ASC`

// Logflare returns bucket timestamps as microseconds since the epoch.
const toIso = (timestamp: unknown) =>
  typeof timestamp === 'number'
    ? new Date(timestamp / 1000).toISOString()
    : new Date(String(timestamp)).toISOString()

/**
 * Self-hosted stand-in for the platform's `service-health` endpoint: per time bucket, the
 * ok / warning / error counts of every service, assembled from the logs endpoint.
 *
 * _Only call this from server-side self-hosted code._
 */
export async function retrieveServiceHealth({
  projectRef,
  params,
}: {
  projectRef: string
  params: Record<string, string | undefined>
}): Promise<WrappedResult<{ result: ServiceHealthRow[] }>> {
  const granularity = GRANULARITIES.includes(params.granularity ?? '')
    ? params.granularity!
    : 'hour'
  const start = new Date(params.iso_timestamp_start ?? Date.now() - 24 * 3600 * 1000)
  if (Number.isNaN(start.getTime())) {
    return { data: undefined, error: new Error('Invalid iso_timestamp_start') }
  }

  const results = await Promise.all(
    Object.entries(SERVICES).map(async ([key, service]) => {
      const { data, error } = await retrieveAnalyticsData({
        name: 'logs.all',
        projectRef,
        params: {
          sql: serviceSql(service, granularity, start.toISOString()),
          iso_timestamp_start: start.toISOString(),
          iso_timestamp_end: params.iso_timestamp_end,
        },
      })
      const failure = error ?? (data?.error ? new Error(JSON.stringify(data.error)) : undefined)
      return { key, rows: data?.result ?? [], failure }
    })
  )

  const failed = results.find((r) => r.failure)
  if (failed?.failure && results.every((r) => r.failure)) {
    return { data: undefined, error: failed.failure }
  }

  const buckets = new Map<string, ServiceHealthRow>()
  for (const { key, rows } of results) {
    for (const row of rows) {
      const timestamp = toIso(row.timestamp)
      const ok = Number(row.ok_count ?? 0)
      const warning = Number(row.warning_count ?? 0)
      const error = Number(row.error_count ?? 0)
      const bucket = buckets.get(timestamp) ?? { timestamp }
      bucket[key] = { ok, warning, error, total: ok + warning + error }
      buckets.set(timestamp, bucket)
    }
  }

  const result = [...buckets.values()]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((bucket) => {
      for (const key of Object.keys(SERVICES)) bucket[key] = bucket[key] ?? EMPTY
      return bucket
    })

  return { data: { result }, error: undefined }
}
