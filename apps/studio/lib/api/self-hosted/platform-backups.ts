/**
 * The platform's backups of this deployment's database, for self-hosted
 * Studio. The platform (Stackblaze / kubero-server) mints an app-scoped token
 * at deploy (KUBERO_APP_TOKEN) that may only call the backup routes of this
 * environment; Studio's server proxies to it, the browser never sees the token.
 */
export type PlatformDump = { key: string; size: number; lastModified?: string }
export type PlatformJob = {
  name: string
  phase: 'Running' | 'Completed' | 'Failed' | string
  startedAt?: string | null
  finishedAt?: string | null
}
export type PlatformBackups = { dumps: PlatformDump[]; jobs: PlatformJob[] }
export type DumpCadence = { id: string; enabled: boolean; retentionHours: number }
export type DumpSchedule = {
  cadences: DumpCadence[]
  dbNames: string[] | null
  configured: boolean
}

export type PlatformError = { status: number; message: string }
export type PlatformResult<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: PlatformError }

const env = () => ({
  apiUrl: (process.env.KUBERO_API_URL ?? '').replace(/\/+$/, ''),
  token: process.env.KUBERO_APP_TOKEN ?? '',
  pipeline: process.env.KUBERO_PIPELINE ?? '',
  phase: process.env.KUBERO_PHASE ?? '',
  instance: process.env.KUBERO_DB_INSTANCE ?? '',
})

/** Studio can talk to the platform about its database. */
export function platformBackupsConfigured(): boolean {
  const e = env()
  return !!(e.apiUrl && e.token && e.pipeline && e.phase && e.instance)
}

export function platformBackupsInfo() {
  const e = env()
  return { pipeline: e.pipeline, phase: e.phase, instance: e.instance }
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<PlatformResult<T>> {
  const e = env()
  if (!platformBackupsConfigured()) {
    return {
      error: { status: 404, message: 'Platform backups are not configured for this Studio' },
    }
  }
  let response: Response
  try {
    response = await fetch(`${e.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${e.token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Platform is unreachable'
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
    const message = [json?.message, json?.error].find(
      (candidate): candidate is string => typeof candidate === 'string'
    )
    return { error: { status: response.status, message: message ?? response.statusText } }
  }
  return { data: (json ?? {}) as T }
}

const base = () => {
  const e = env()
  return `/api/pipelines/${encodeURIComponent(e.pipeline)}/${encodeURIComponent(e.phase)}/backups`
}
const dbPath = () => `${base()}/db/${encodeURIComponent(env().instance)}`

export const listBackups = () => call<PlatformBackups>('GET', dbPath())
export const backupNow = () => call<{ ok: boolean; job: string }>('POST', `${dbPath()}/dump`)
export const restoreBackup = (key: string) =>
  call<{ ok: boolean; job: string }>('POST', `${dbPath()}/restore`, {
    key,
    confirm: env().instance,
  })
export const deleteBackup = (key: string) =>
  call<{ ok: boolean }>('DELETE', `${dbPath()}?key=${encodeURIComponent(key)}`)
export const getSchedule = () => call<DumpSchedule>('GET', `${base()}/db-schedule`)
export const setSchedule = (schedule: { cadences: DumpCadence[]; dbNames?: string[] | null }) =>
  call<DumpSchedule>('PUT', `${base()}/db-schedule`, schedule)
