// Self-hosted Studio on a hosting platform: the deployment seen as one project. The
// platform knows its services, their versions and sizes, and can restart them; these calls
// back the native project settings screens. Server-side only.
import { call, type PlatformResult } from './platform-backups'
import { platformBranchesConfigured } from './platform-branches'

export type PlatformService = {
  /** Role in the deployment: `primary` (gateway), `auth`, `rest`, ... */
  role: string
  name: string
  image: string
  version: string
  replicas: number
  resources: {
    requests?: { cpu?: string; memory?: string }
    limits?: { cpu?: string; memory?: string }
  }
}

export type PlatformProject = {
  template: string
  primary: string
  host: string | null
  services: PlatformService[]
}

const base = () =>
  `/api/apps/${encodeURIComponent(process.env.KUBERO_PIPELINE ?? '')}/${encodeURIComponent(
    process.env.KUBERO_PHASE ?? ''
  )}/${encodeURIComponent((process.env.KUBERO_DB_INSTANCE ?? '').replace(/-postgresql$/, ''))}/group`

// Asked for with the project details on every page.
const CACHE_MS = 15_000
let cached: { at: number; project: PlatformProject | null } | undefined

/** The deployment's services; null when the platform does not manage this Studio's project. */
export async function getPlatformProject(): Promise<PlatformProject | null> {
  if (!platformBranchesConfigured()) return null
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.project
  const result = await call<PlatformProject>('GET', base())
  const project = result.error ? null : result.data
  cached = { at: Date.now(), project }
  return project
}

export async function restartPlatformProject(
  roles?: string[]
): Promise<PlatformResult<{ restarted: string[]; failed: string[] }>> {
  return call('POST', `${base()}/restart`, roles?.length ? { roles } : {})
}

const versionOf = (project: PlatformProject, pattern: RegExp) =>
  project.services.find((s) => pattern.test(s.image))?.version.replace(/^v/, '') ?? ''

/** Versions in the shape of the platform's service-versions response. */
export function serviceVersions(project: PlatformProject) {
  return {
    gotrue: versionOf(project, /gotrue|auth/),
    postgrest: versionOf(project, /postgrest/),
  }
}

export type PlatformMembers = {
  /** People of the workspace that owns this deployment on the platform. */
  members: {
    id: string
    email: string
    name: string
    role: string | null
    teams: { name: string; role: string }[]
    lastSignInAt: string | null
  }[]
  invites: { email: string; role: string; expiresAt: string | null }[]
  /** The platform's dashboard, where members are invited and roles changed. */
  manageUrl: string
}

export async function getPlatformMembers(): Promise<PlatformResult<PlatformMembers>> {
  return call<PlatformMembers>('GET', `${base()}/members`)
}

/** Deletes the whole deployment on the platform: services, database and storage. */
export async function deletePlatformProject(): Promise<PlatformResult<{ removed: string[] }>> {
  cached = undefined
  return call('DELETE', base())
}

/**
 * How to reach the database. It is reachable from inside the platform's cluster only, so
 * these are the in-cluster host and this deployment's own database and role.
 */
export function platformDatabase() {
  if (!process.env.KUBERO_DB_INSTANCE || !process.env.PGHOST) return null
  return {
    db_host: process.env.PGHOST,
    db_port: parseInt(process.env.PGPORT || '5432', 10),
    db_name: process.env.PGDATABASE || process.env.POSTGRES_DB || 'postgres',
    db_user: process.env.PGUSER || 'postgres',
  }
}

/** A secret of the deployment's functions: its name and the SHA-256 of its value. */
export type PlatformSecret = { name: string; value: string }

export async function getPlatformSecrets(): Promise<PlatformResult<PlatformSecret[]>> {
  return call<PlatformSecret[]>('GET', `${base()}/secrets`)
}

/** Adds or replaces secrets; the platform restarts the functions service. */
export async function setPlatformSecrets(
  secrets: { name: string; value: string }[]
): Promise<PlatformResult<PlatformSecret[]>> {
  return call<PlatformSecret[]>('POST', `${base()}/secrets`, secrets)
}

export async function deletePlatformSecrets(
  names: string[]
): Promise<PlatformResult<PlatformSecret[]>> {
  return call<PlatformSecret[]>('DELETE', `${base()}/secrets`, names)
}
