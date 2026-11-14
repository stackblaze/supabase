// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearPendingRestore,
  PENDING_RESTORE_KEY,
  readPendingRestore,
  restoreOutcome,
  savePendingRestore,
  type PendingRestore,
} from './in-place-restore'

const restore: PendingRestore = {
  job: 'in-place-restore-abc',
  instance: 'supabase-api-supabase-postgresql',
  backup: 'communal-dumps/x/dump.manual.dump',
  startedAt: '2026-11-14T20:00:00.000Z',
}
const started = Date.parse(restore.startedAt)

describe('pending in-place restore', () => {
  beforeEach(() => window.localStorage.clear())

  it('is kept across a reload and cleared', () => {
    savePendingRestore(restore)
    expect(readPendingRestore()).toEqual(restore)
    clearPendingRestore()
    expect(readPendingRestore()).toBeUndefined()
  })

  it('ignores a malformed entry', () => {
    window.localStorage.setItem(PENDING_RESTORE_KEY, '{"nope":1}')
    expect(readPendingRestore()).toBeUndefined()
    window.localStorage.setItem(PENDING_RESTORE_KEY, 'not json')
    expect(readPendingRestore()).toBeUndefined()
  })
})

describe('restoreOutcome', () => {
  it('follows the job phase', () => {
    expect(restoreOutcome(restore, [{ name: restore.job, phase: 'Running' }])).toBe('running')
    expect(restoreOutcome(restore, [{ name: restore.job, phase: 'Completed' }])).toBe('completed')
    expect(restoreOutcome(restore, [{ name: restore.job, phase: 'Failed' }])).toBe('failed')
  })

  it('ignores other jobs', () => {
    const jobs = [{ name: 'dump-other', phase: 'Completed' }]
    expect(restoreOutcome(restore, jobs, started + 60_000)).toBe('running')
  })

  it('is running while the job is not listed yet, unknown after an hour', () => {
    expect(restoreOutcome(restore, undefined, started + 60_000)).toBe('running')
    expect(restoreOutcome(restore, [], started + 2 * 60 * 60 * 1000)).toBe('unknown')
  })
})
