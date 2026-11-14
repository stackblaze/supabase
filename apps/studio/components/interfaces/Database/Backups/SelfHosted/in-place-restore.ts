/**
 * An in-place restore stops the whole deployment, Studio included, so the page that started it
 * goes away. The started restore is remembered in the browser (best effort) so that the Backups
 * page, once Studio is back or after a reload, can say how it ended.
 */
export type PendingRestore = {
  /** The restore Job's name; its status is in the backups' jobs list. */
  job: string
  instance: string
  backup: string
  startedAt: string
}

export type RestoreOutcome = 'running' | 'completed' | 'failed' | 'unknown'

export const PENDING_RESTORE_KEY = 'stackblaze:studio:in-place-restore'

/** After this long without the job in the list, stop showing the restore as running. */
const UNKNOWN_AFTER_MS = 60 * 60 * 1000

export function readPendingRestore(): PendingRestore | undefined {
  try {
    const raw = window.localStorage.getItem(PENDING_RESTORE_KEY)
    if (!raw) return
    const value = JSON.parse(raw) as Partial<PendingRestore>
    if (typeof value?.job !== 'string' || typeof value.startedAt !== 'string') return
    return {
      job: value.job,
      instance: String(value.instance ?? ''),
      backup: String(value.backup ?? ''),
      startedAt: value.startedAt,
    }
  } catch {
    return
  }
}

export function savePendingRestore(restore: PendingRestore) {
  try {
    window.localStorage.setItem(PENDING_RESTORE_KEY, JSON.stringify(restore))
  } catch {
    // Storage unavailable: the page still shows the restore until it is left.
  }
}

export function clearPendingRestore() {
  try {
    window.localStorage.removeItem(PENDING_RESTORE_KEY)
  } catch {
    // Nothing to clear.
  }
}

/** How the restore ended, from the jobs list (Kubernetes Job phases). */
export function restoreOutcome(
  restore: PendingRestore,
  jobs: Array<{ name: string; phase: string }> | undefined,
  now = Date.now()
): RestoreOutcome {
  const job = jobs?.find((j) => j.name === restore.job)
  if (job?.phase === 'Completed' || job?.phase === 'Succeeded') return 'completed'
  if (job?.phase === 'Failed') return 'failed'
  if (job) return 'running'
  const started = Date.parse(restore.startedAt)
  return Number.isFinite(started) && now - started > UNKNOWN_AFTER_MS ? 'unknown' : 'running'
}
