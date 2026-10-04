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
