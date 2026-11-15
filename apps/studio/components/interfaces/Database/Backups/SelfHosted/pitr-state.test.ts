import { describe, expect, it } from 'vitest'

import { currentRestore, pitrWindowUnix, restoreLabel, type PitrStatus } from './pitr-state'

const base: PitrStatus = {
  instance: 'supabase-api-x-postgresql-ab12',
  displayName: 'supabase-api-x-postgresql',
  available: true,
  unavailableReason: null,
  enabled: true,
  retentionDays: 7,
  retentionChoices: [7, 14],
  maxRetentionDays: 14,
  walArchiving: { healthy: true, lastArchivedTime: null, lastFailedTime: null },
  firstRecoverableTime: '2026-11-15T10:00:00Z',
  lastRecoverableTime: '2026-11-15T11:59:00Z',
  lastBaseBackupTime: '2026-11-15T10:00:00Z',
  archiveKeptUntil: null,
  restores: [],
  restoredFrom: null,
}
const restore = (over: Partial<PitrStatus['restores'][number]> = {}) => ({
  instance: 'postgres-pitr-q7r2',
  targetTime: '2026-11-15 11:30:00.000000+00',
  requestedAt: '2026-11-15T12:00:00Z',
  phase: 'Setting up primary',
  ready: false,
  cutover: 'requested',
  error: null,
  ...over,
})

describe('platform PITR state', () => {
  it('offers first base backup .. now as the window, nothing before a base backup', () => {
    const now = Date.parse('2026-11-15T12:00:00Z')
    expect(pitrWindowUnix(base, now)).toEqual({
      earliest: Date.parse('2026-11-15T10:00:00Z') / 1000,
      latest: now / 1000,
    })
    expect(pitrWindowUnix({ ...base, firstRecoverableTime: null }, now)).toBeNull()
    expect(pitrWindowUnix({ ...base, enabled: false }, now)).toBeNull()
  })

  it('follows a restore from the source and, after the cutover, from the restored database', () => {
    expect(currentRestore(base)).toBeNull()
    expect(currentRestore({ ...base, restores: [restore()] })).toEqual({
      restore: restore(),
      onRestored: false,
    })
    // A copy-only restore (no cutover) or a finished one is not "in flight" on the source.
    expect(currentRestore({ ...base, restores: [restore({ cutover: null })] })).toBeNull()
    expect(currentRestore({ ...base, restores: [restore({ cutover: 'done' })] })).toBeNull()
    const done = restore({ cutover: 'done', ready: true })
    expect(currentRestore({ ...base, restoredFrom: done })).toEqual({
      restore: done,
      onRestored: true,
    })
  })

  it('labels the steps', () => {
    expect(restoreLabel(restore())).toBe('Recovering (Setting up primary)')
    expect(restoreLabel(restore({ ready: true }))).toBe('Ready, switching over')
    expect(restoreLabel(restore({ cutover: 'running' }))).toMatch(/Switching/)
    expect(restoreLabel(restore({ cutover: 'done' }))).toBe('Restored')
    expect(restoreLabel(restore({ cutover: 'failed' }))).toBe('Failed')
  })
})
