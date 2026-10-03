/**
 * Branches of this Supabase deployment, for self-hosted Studio. A branch is a second,
 * disposable deployment the platform creates fresh from the Supabase template next to this
 * one, with its own database, storage and Studio. Studio's server proxies to the platform
 * with its app token (capability `branches`); the browser never sees the token.
 */
import { call, platformBackupsConfigured, type PlatformResult } from './platform-backups'

export type PlatformBranch = {
  name: string
  suffix: string
  primary: string
  host: string | null
  apps: { name: string; role: string }[]
}

export type PlatformBranches = {
  parent: { primary: string; host: string | null }
  /** The branch this Studio belongs to, or null when it is the main deployment. */
  current: string | null
  branches: PlatformBranch[]
}

const env = () => ({
  pipeline: process.env.KUBERO_PIPELINE ?? '',
  phase: process.env.KUBERO_PHASE ?? '',
  // The deployment's primary (gateway) app, which its add-ons are named after.
  primary: (process.env.KUBERO_DB_INSTANCE ?? '').replace(/-postgresql$/, ''),
})

export function platformBranchesConfigured(): boolean {
  return platformBackupsConfigured() && !!env().primary
}

const base = () => {
  const e = env()
  return `/api/apps/${encodeURIComponent(e.pipeline)}/${encodeURIComponent(e.phase)}/${encodeURIComponent(e.primary)}/branches`
}

export const listBranches = (): Promise<PlatformResult<PlatformBranches>> =>
  call<PlatformBranches>('GET', base())
export const createBranch = (name: string) => call<PlatformBranch>('POST', base(), { name })
export const deleteBranch = (name: string) =>
  call<{ removed: string[] }>('DELETE', `${base()}/${encodeURIComponent(name)}`)
