/**
 * Point-in-time recovery state for self-hosted Studio (the platform's PITR, kubero-server
 * #2407): what the page shows, from the platform's status, and the restore this browser
 * started, kept across Studio restarting during the project cutover.
 */
type PitrRestore = {
  instance: string
  targetTime: string | null
  requestedAt: string | null
  phase: string | null
  ready: boolean
  cutover: string | null
  error: string | null
}
export type PitrStatus = {
  instance: string
  displayName: string | null
  available: boolean
  unavailableReason: string | null
  enabled: boolean
  retentionDays: number | null
  retentionChoices: number[]
  maxRetentionDays: number | null
  walArchiving: {
    healthy: boolean | null
    lastArchivedTime: string | null
    lastFailedTime: string | null
  }
  firstRecoverableTime: string | null
  lastRecoverableTime: string | null
  lastBaseBackupTime: string | null
  archiveKeptUntil: string | null
  restores: PitrRestore[]
  restoredFrom: PitrRestore | null
}

/** The recoverable window as unix seconds, or null while there is none yet. */
export function pitrWindowUnix(
  status: Pick<PitrStatus, 'enabled' | 'firstRecoverableTime' | 'lastRecoverableTime'>,
  now = Date.now()
): { earliest: number; latest: number } | null {
  if (!status.enabled || !status.firstRecoverableTime) return null
  const earliest = Math.ceil(Date.parse(status.firstRecoverableTime) / 1000)
  // A restore seals the current WAL first, so "now" is recoverable while archiving works.
  const latest = Math.floor(now / 1000)
  if (!Number.isFinite(earliest) || latest < earliest) return null
  return { earliest, latest }
}

/** The restore in flight (or just finished) for this database, if any. */
export function currentRestore(status: PitrStatus | undefined): {
  restore: PitrRestore
  /** This database IS the restored one (Studio followed the cutover onto it). */
  onRestored: boolean
} | null {
  if (!status) return null
  if (status.restoredFrom && status.restoredFrom.cutover)
    return { restore: status.restoredFrom, onRestored: true }
  const r = status.restores.find((x) => x.cutover && x.cutover !== 'done')
  return r ? { restore: r, onRestored: false } : null
}

/** What a restore's state reads as. */
export function restoreLabel(r: PitrRestore): string {
  if (r.cutover === 'done') return 'Restored'
  if (r.cutover === 'failed') return 'Failed'
  if (r.cutover === 'running') return 'Switching the project to the restored database'
  return r.ready ? 'Ready, switching over' : `Recovering (${r.phase ?? 'starting'})`
}

const KEY = 'stackblaze:pitr-restore'

export type PendingPitr = { targetTime: string; startedAt: string }

export function savePendingPitr(p: PendingPitr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* private mode */
  }
}
export function readPendingPitr(): PendingPitr | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.targetTime === 'string' ? v : undefined
  } catch {
    return undefined
  }
}
export function clearPendingPitr() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}
