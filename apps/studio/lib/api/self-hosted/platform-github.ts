/**
 * The GitHub repository this Supabase deployment is connected to, for self-hosted Studio's
 * native GitHub integration screens. The hosting platform owns the GitHub App and the
 * connection; Studio's server asks it with the deployment's app token and answers in the
 * shapes the screens were written for.
 */
import { call, type PlatformResult } from './platform-backups'
import { platformBranchesConfigured } from './platform-branches'
import type { components } from '@/data/api'
import { DEFAULT_PROJECT } from '@/lib/constants/api'

type PlatformConnection = {
  id: number
  installationId: string
  repositoryName: string
  workdir: string
  newBranchPerPr: boolean
  supabaseChangesOnly: boolean
  branchLimit: number
  productionBranch: string | null
  createdAt: string
  updatedAt: string
}

type PlatformStatus = {
  authorized: boolean
  installations: { installationId: string; owner: string }[]
  connection: PlatformConnection | null
}

type PlatformRepository = { name: string; defaultBranch: string; installationId: string }

export type NativeConnection =
  components['schemas']['ListGitHubConnectionsResponse_Output']['connections'][number]
export type NativeRepository =
  components['schemas']['ListGitHubRepositoriesResponse_Output']['repositories'][number]

export type ConnectionSettings = {
  repositoryId?: number
  workdir?: string
  newBranchPerPr?: boolean
  supabaseChangesOnly?: boolean
  branchLimit?: number
  productionBranch?: string | null
}

const base = () => {
  const pipeline = process.env.KUBERO_PIPELINE ?? ''
  const phase = process.env.KUBERO_PHASE ?? ''
  const primary = (process.env.KUBERO_DB_INSTANCE ?? '').replace(/-postgresql$/, '')
  return `/api/apps/${encodeURIComponent(pipeline)}/${encodeURIComponent(phase)}/${encodeURIComponent(primary)}/branches/github`
}

const NOT_OFFERED = { status: 404, message: 'GitHub integration is not offered on this platform' }

/**
 * The platform identifies a repository by `owner/name`; the screens want a number. A stable
 * hash of the name stands in for GitHub's repository id and is resolved back through the
 * list of repositories the installations can see.
 */
export function repositoryId(name: string): number {
  let hash = 2166136261
  for (const char of name.toLowerCase()) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 2147483647
}

export async function getGithubStatus(): Promise<PlatformResult<PlatformStatus>> {
  if (!platformBranchesConfigured()) return { error: NOT_OFFERED }
  return call<PlatformStatus>('GET', base())
}

/** Production branch of the connection, shown as the main branch's Git branch. */
export async function getProductionGitBranch(): Promise<string | undefined> {
  const status = await getGithubStatus()
  return status.data?.connection?.productionBranch ?? undefined
}

export async function listRepositories(): Promise<PlatformResult<NativeRepository[]>> {
  if (!platformBranchesConfigured()) return { data: [] }
  const result = await call<PlatformRepository[]>('GET', `${base()}/repositories`)
  if (result.error) return { error: result.error }
  return {
    data: (Array.isArray(result.data) ? result.data : []).map((repo) => ({
      id: repositoryId(repo.name),
      name: repo.name,
      default_branch: repo.defaultBranch,
      installation_id: Number(repo.installationId),
    })),
  }
}

function toNative(connection: PlatformConnection): NativeConnection {
  return {
    id: connection.id,
    inserted_at: connection.createdAt,
    updated_at: connection.updatedAt,
    installation_id: Number(connection.installationId),
    branch_limit: connection.branchLimit,
    new_branch_per_pr: connection.newBranchPerPr,
    supabase_changes_only: connection.supabaseChangesOnly,
    workdir: connection.workdir,
    project: { id: DEFAULT_PROJECT.id, name: DEFAULT_PROJECT.name, ref: DEFAULT_PROJECT.ref },
    repository: { id: repositoryId(connection.repositoryName), name: connection.repositoryName },
    user: null,
  }
}

export async function listConnections(): Promise<PlatformResult<NativeConnection[]>> {
  const status = await getGithubStatus()
  if (status.error) {
    // Not offered, or a token minted before the capability existed: no connections.
    if ([401, 403, 404].includes(status.error.status)) return { data: [] }
    return { error: status.error }
  }
  return { data: status.data.connection ? [toNative(status.data.connection)] : [] }
}

/** Whether the tenant has installed the platform's GitHub App anywhere. */
export async function isAuthorized(): Promise<boolean> {
  return (await getGithubStatus()).data?.authorized === true
}

export async function saveConnection(
  settings: ConnectionSettings
): Promise<PlatformResult<NativeConnection>> {
  let repositoryName: string | undefined
  if (settings.repositoryId !== undefined) {
    const repositories = await listRepositories()
    if (repositories.error) return { error: repositories.error }
    repositoryName = repositories.data.find((r) => r.id === settings.repositoryId)?.name
    if (!repositoryName) {
      return { error: { status: 404, message: 'Repository not found for this GitHub App' } }
    }
  }
  const saved = await call<PlatformConnection>('PUT', base(), {
    repositoryName,
    workdir: settings.workdir,
    newBranchPerPr: settings.newBranchPerPr,
    supabaseChangesOnly: settings.supabaseChangesOnly,
    branchLimit: settings.branchLimit,
    productionBranch: settings.productionBranch,
  })
  if (saved.error) return { error: saved.error }
  return { data: toNative(saved.data) }
}

export const deleteConnection = () => call<{ removed: boolean }>('DELETE', base())

export async function branchExists(
  repository: number,
  branch: string
): Promise<PlatformResult<{ name: string }>> {
  const repositories = await listRepositories()
  if (repositories.error) return { error: repositories.error }
  const name = repositories.data.find((r) => r.id === repository)?.name
  if (!name) return { error: { status: 404, message: 'Repository not found' } }
  const query = `branch=${encodeURIComponent(branch)}&repository=${encodeURIComponent(name)}`
  const result = await call<{ name: string; exists: boolean }>(
    'GET',
    `${base()}/branch-exists?${query}`
  )
  if (result.error) return { error: result.error }
  if (!result.data.exists) {
    return { error: { status: 404, message: `Branch "${branch}" not found in ${name}` } }
  }
  return { data: { name: result.data.name } }
}

export const getInstallUrl = () => call<{ url: string }>('GET', `${base()}/install-url`)
