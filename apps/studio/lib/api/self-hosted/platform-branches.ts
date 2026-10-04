/**
 * Branches of this Supabase deployment, for self-hosted Studio's native branch screens. A
 * branch is a second, disposable deployment the platform creates fresh from the Supabase
 * template next to this one, with its own database, storage and Studio. Studio's server
 * asks the platform with its app token (capability `branches`) and answers in the shapes
 * the screens were written for; the browser never sees the token.
 */
import { call, platformBackupsConfigured, type PlatformResult } from './platform-backups'
import { getProductionGitBranch, saveConnection } from './platform-github'
import type { components } from '@/data/api'
import { DEFAULT_PROJECT } from '@/lib/constants/api'

type PlatformBranch = {
  name: string
  suffix: string
  primary: string
  host: string | null
  createdAt?: string | null
  status?: 'creating' | 'ready'
  /** Set on branches the platform created for a pull request of the connected repository. */
  prNumber?: number
  gitBranch?: string
  /** State of the latest run applying the repository's migrations to the branch. */
  migration?: 'none' | 'running' | 'passed' | 'failed'
  /** When a merge request was opened for the branch. */
  reviewRequestedAt?: string
}

const branchStatus = (ready: boolean, migration: PlatformBranch['migration']) => {
  if (!ready) return 'CREATING_PROJECT' as const
  if (migration === 'running') return 'RUNNING_MIGRATIONS' as const
  if (migration === 'failed') return 'MIGRATIONS_FAILED' as const
  return 'FUNCTIONS_DEPLOYED' as const
}

type PlatformBranches = {
  parent: { primary: string; host: string | null; createdAt?: string | null }
  /** The branch this Studio belongs to, or null when it is the main deployment. */
  current: string | null
  branches: PlatformBranch[]
}

/** A branch as the native screens expect it, plus where its own Studio lives. */
export type NativeBranch = components['schemas']['BranchResponse_Output'] & {
  studio_url?: string
}

/** Ref the main deployment gets when asked from a branch's Studio (whose own ref is the default). */
export const MAIN_REF = 'main'
const MAIN_ID = 'main'

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

const studioUrl = (host: string | null | undefined) => (host ? `https://${host}` : undefined)

function toNative(list: PlatformBranches, productionGitBranch?: string): NativeBranch[] {
  const selfRef = DEFAULT_PROJECT.ref
  const onMain = !list.current
  const mainRef = onMain ? selfRef : MAIN_REF
  const epoch = new Date(0).toISOString()
  const mainCreated = list.parent.createdAt ?? epoch

  const main: NativeBranch = {
    id: MAIN_ID,
    name: 'main',
    project_ref: mainRef,
    parent_project_ref: mainRef,
    is_default: true,
    persistent: true,
    status: 'FUNCTIONS_DEPLOYED',
    preview_project_status: 'ACTIVE_HEALTHY',
    created_at: mainCreated,
    updated_at: mainCreated,
    with_data: false,
    ...(productionGitBranch ? { git_branch: productionGitBranch } : {}),
    ...(onMain ? {} : { studio_url: studioUrl(list.parent.host) }),
  }

  const branches = list.branches.map((branch): NativeBranch => {
    const isSelf = branch.name === list.current
    // Older platforms report no status: a branch with a URL is taken as up.
    const ready = branch.status ? branch.status === 'ready' : !!branch.host
    const created = branch.createdAt ?? epoch
    return {
      id: branch.name,
      name: branch.name,
      project_ref: isSelf ? selfRef : `branch-${branch.suffix}`,
      parent_project_ref: mainRef,
      is_default: false,
      persistent: false,
      status: branchStatus(ready, branch.migration),
      preview_project_status: ready ? 'ACTIVE_HEALTHY' : 'COMING_UP',
      created_at: created,
      updated_at: created,
      with_data: false,
      ...(branch.prNumber ? { pr_number: branch.prNumber } : {}),
      ...(branch.gitBranch ? { git_branch: branch.gitBranch } : {}),
      ...(branch.reviewRequestedAt ? { review_requested_at: branch.reviewRequestedAt } : {}),
      ...(isSelf ? {} : { studio_url: studioUrl(branch.host) }),
    }
  })

  return [main, ...branches]
}

export type BranchingState = {
  /** The platform offers branches for this deployment. */
  enabled: boolean
  /** This Studio is itself a branch. */
  isBranch: boolean
  branches: NativeBranch[]
}

const OFF: BranchingState = { enabled: false, isBranch: false, branches: [] }

// The project details and the branch list are asked for together on every page; one
// answer from the platform serves them all for a few seconds.
const CACHE_MS = 5_000
let cached: { at: number; state: BranchingState } | undefined
// Branch name by the platform's name of its primary app; merge runs are named after it.
let primaries = new Map<string, string>()

/** What the native screens need to know; "not offered" rather than an error when the platform or token cannot do branches. */
export async function getBranchingState(): Promise<PlatformResult<BranchingState>> {
  if (!platformBranchesConfigured()) return { data: OFF }
  if (cached && Date.now() - cached.at < CACHE_MS) return { data: cached.state }
  const result = await call<PlatformBranches>('GET', base())
  if (result.error) {
    // No branch routes on this platform, or a token minted before the capability existed.
    if ([401, 403, 404].includes(result.error.status)) return { data: OFF }
    return { error: result.error }
  }
  const state: BranchingState = {
    enabled: true,
    isBranch: !!result.data.current,
    branches: toNative(result.data, await getProductionGitBranch()),
  }
  cached = { at: Date.now(), state }
  primaries = new Map(result.data.branches.map((b) => [b.primary, b.name]))
  return { data: state }
}

export async function createBranch(name: string): Promise<PlatformResult<NativeBranch>> {
  const created = await call<PlatformBranch>('POST', base(), { name })
  if (created.error) return { error: created.error }
  cached = undefined
  const state = await getBranchingState()
  const branch = state.data?.branches.find((b) => b.id === created.data.name)
  if (branch) return { data: branch }
  // Not listed yet (the platform caches its app list briefly): answer from what was created.
  const now = new Date().toISOString()
  return {
    data: {
      id: created.data.name,
      name: created.data.name,
      project_ref: `branch-${created.data.suffix}`,
      parent_project_ref: DEFAULT_PROJECT.ref,
      is_default: false,
      persistent: false,
      status: 'CREATING_PROJECT',
      preview_project_status: 'COMING_UP',
      created_at: now,
      updated_at: now,
      with_data: false,
    },
  }
}

/** Looks a branch up by its id (its name) or by the ref the native screens know it under. */
export async function findBranch(idOrRef: string): Promise<PlatformResult<NativeBranch>> {
  const state = await getBranchingState()
  if (state.error) return { error: state.error }
  const branch = state.data.branches.find((b) => b.id === idOrRef || b.project_ref === idOrRef)
  if (!branch) return { error: { status: 404, message: 'Branch not found' } }
  return { data: branch }
}

/**
 * What can be changed here: the main branch's Git branch (the branch of the connected
 * repository whose merges deploy to this deployment), and a branch's merge request, which
 * is opened and closed.
 */
export async function updateBranch(
  idOrRef: string,
  changes: { gitBranch?: string; requestReview?: boolean }
): Promise<PlatformResult<NativeBranch>> {
  const found = await findBranch(idOrRef)
  if (found.error) return { error: found.error }
  if (changes.gitBranch !== undefined) {
    if (!found.data.is_default) {
      return {
        error: { status: 400, message: 'Only the main branch can be linked to a Git branch' },
      }
    }
    const saved = await saveConnection({ productionBranch: changes.gitBranch || null })
    if (saved.error) return { error: saved.error }
    cached = undefined
  }
  if (changes.requestReview !== undefined) {
    if (found.data.is_default) {
      return { error: { status: 400, message: 'The main branch has no merge request' } }
    }
    const saved = await call<unknown>('PATCH', `${base()}/${encodeURIComponent(found.data.name)}`, {
      reviewRequested: changes.requestReview,
    })
    if (saved.error) return { error: saved.error }
    cached = undefined
  }
  return findBranch(idOrRef)
}

export async function deleteBranch(idOrRef: string): Promise<PlatformResult<{ message: 'ok' }>> {
  const found = await findBranch(idOrRef)
  if (found.error) return { error: found.error }
  if (found.data.is_default) {
    return { error: { status: 400, message: 'The main branch cannot be deleted' } }
  }
  const removed = await call<unknown>('DELETE', `${base()}/${encodeURIComponent(found.data.name)}`)
  if (removed.error) return { error: removed.error }
  cached = undefined
  return { data: { message: 'ok' } }
}

type PlatformDiff = {
  id: string
  state: 'running' | 'passed' | 'failed'
  sql?: string
  error?: string
}

// Stays under the gateway's request timeout; the query is asked again when it is not done by then.
const DIFF_WAIT_MS = 45_000

/** SQL that brings the main deployment's schema to the branch's; empty when they are equal. */
export async function getBranchDiff(idOrRef: string): Promise<PlatformResult<string>> {
  const found = await findBranch(idOrRef)
  if (found.error) return { error: found.error }
  if (found.data.is_default) return { data: '' }
  const path = `${base()}/${encodeURIComponent(found.data.name)}/diff`
  const until = Date.now() + DIFF_WAIT_MS
  let result = await call<PlatformDiff>('GET', path)
  while (!result.error && result.data.state === 'running' && Date.now() < until) {
    result = await call<PlatformDiff>('GET', `${path}?id=${encodeURIComponent(result.data.id)}`)
  }
  if (result.error) return { error: result.error }
  if (result.data.state === 'running') {
    return { error: { status: 503, message: 'The comparison is still running, try again' } }
  }
  if (result.data.state === 'failed') {
    return { error: { status: 502, message: result.data.error ?? 'The comparison failed' } }
  }
  return { data: result.data.sql ?? '' }
}

/** Starts merging a branch into the main deployment; the run is followed with getMergeRun. */
export async function mergeBranch(
  idOrRef: string
): Promise<PlatformResult<{ workflow_run_id: string; message: 'ok' }>> {
  const found = await findBranch(idOrRef)
  if (found.error) return { error: found.error }
  if (found.data.is_default) {
    return { error: { status: 400, message: 'The main branch cannot be merged' } }
  }
  const started = await call<{ id: string }>(
    'POST',
    `${base()}/${encodeURIComponent(found.data.name)}/merge`
  )
  if (started.error) return { error: started.error }
  return { data: { workflow_run_id: started.data.id, message: 'ok' } }
}

export type MergeRun = {
  id: string
  state: 'running' | 'passed' | 'failed'
  createdAt: string | null
  finishedAt: string | null
  logs: string
}

export async function getMergeRun(runId: string): Promise<PlatformResult<MergeRun>> {
  const state = await getBranchingState()
  if (state.error) return { error: state.error }
  const primary = [...primaries.keys()].find((p) => runId.startsWith(`${p}-merge-`))
  const name = primary ? primaries.get(primary) : undefined
  if (!name) return { error: { status: 404, message: 'Run not found' } }
  return call<MergeRun>(
    'GET',
    `${base()}/${encodeURIComponent(name)}/runs/${encodeURIComponent(runId)}`
  )
}
