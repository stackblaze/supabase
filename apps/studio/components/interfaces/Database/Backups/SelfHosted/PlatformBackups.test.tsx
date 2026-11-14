import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PENDING_RESTORE_KEY, savePendingRestore } from './in-place-restore'
import { PlatformBackups } from './PlatformBackups'
import { customRender } from '@/tests/lib/custom-render'

const INSTANCE = 'supabase-api-supabase-postgresql'
const DUMP_KEY = 'communal-dumps/qa/db/dump-1.manual.dump'
const RESTORE_JOB = 'in-place-restore-123'
// The platform answers with its minted instance; Studio must keep showing the display name.
const MINTED_INSTANCE = `${INSTANCE}-4biq`

type Job = { name: string; phase: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Fakes Studio's backups API; `jobs` and `down` can change between requests. */
function mockBackupsApi(state: { jobs: Job[]; down?: boolean; databaseDown?: boolean }) {
  const posted: unknown[] = []
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (state.down) throw new TypeError('Failed to fetch')
    if (url.endsWith('/api/self-hosted/backups/restore')) {
      posted.push(JSON.parse(String(init?.body)))
      return json({ ok: true, job: RESTORE_JOB, instance: MINTED_INSTANCE, key: DUMP_KEY }, 202)
    }
    if (url.endsWith('/api/platform/pg-meta/default/query')) {
      return state.databaseDown ? json({ error: {} }, 500) : json([{ '?column?': 1 }])
    }
    if (url.endsWith('/api/self-hosted/backups/schedule')) {
      return json({ cadences: [], dbNames: null, configured: false })
    }
    if (url.endsWith('/api/self-hosted/backups')) {
      return json({
        enabled: true,
        instance: INSTANCE,
        dumps: [{ key: DUMP_KEY, size: 1024, lastModified: '2026-11-14T18:00:00Z' }],
        jobs: state.jobs,
      })
    }
    return json({}, 404)
  })
  return { fetchMock, posted }
}

describe('PlatformBackups in-place restore', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('asks for the database name, then shows the project as restoring', async () => {
    const user = userEvent.setup()
    const { posted } = mockBackupsApi({ jobs: [] })
    customRender(<PlatformBackups />)

    await user.click(await screen.findByRole('button', { name: 'Restore' }))

    expect(screen.getByText(/Any changes made after that backup are lost/)).toBeInTheDocument()
    expect(
      screen.getByText(/Studio included, is unavailable while the restore runs/)
    ).toBeInTheDocument()
    const confirm = screen.getAllByRole('button', { name: 'Restore' }).at(-1)!
    expect(confirm).toBeDisabled()

    await user.type(screen.getByLabelText('Database name'), INSTANCE)
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(
      await screen.findByText('Restoring… the project will be back shortly')
    ).toBeInTheDocument()
    expect(posted).toEqual([{ key: DUMP_KEY, confirm: INSTANCE }])
    const stored = JSON.parse(window.localStorage.getItem(PENDING_RESTORE_KEY)!)
    expect(stored.job).toBe(RESTORE_JOB)
    expect(stored.instance).toBe(INSTANCE)
    expect(screen.queryByText(MINTED_INSTANCE)).not.toBeInTheDocument()
  })

  it('keeps showing the restore while Studio is down', async () => {
    savePendingRestore({
      job: RESTORE_JOB,
      instance: INSTANCE,
      backup: DUMP_KEY,
      startedAt: new Date().toISOString(),
    })
    mockBackupsApi({ jobs: [], down: true })
    customRender(<PlatformBackups />)

    expect(
      await screen.findByText('Restoring… the project will be back shortly')
    ).toBeInTheDocument()
    expect(screen.queryByText('Could not load backups')).not.toBeInTheDocument()
  })

  it('shows how the restore ended once Studio is back, until dismissed', async () => {
    const user = userEvent.setup()
    savePendingRestore({
      job: RESTORE_JOB,
      instance: INSTANCE,
      backup: DUMP_KEY,
      startedAt: new Date().toISOString(),
    })
    mockBackupsApi({ jobs: [{ name: RESTORE_JOB, phase: 'Completed' }] })
    customRender(<PlatformBackups />)

    expect(await screen.findByText('Restore completed')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`^${INSTANCE} now holds the backup`))).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(screen.queryByText('Restore completed')).not.toBeInTheDocument())
    expect(window.localStorage.getItem(PENDING_RESTORE_KEY)).toBeNull()
  })

  it('waits for the database to answer before calling the restore done', async () => {
    savePendingRestore({
      job: RESTORE_JOB,
      instance: INSTANCE,
      backup: DUMP_KEY,
      startedAt: new Date().toISOString(),
    })
    const state = { jobs: [{ name: RESTORE_JOB, phase: 'Completed' }], databaseDown: true }
    mockBackupsApi(state)
    customRender(<PlatformBackups />)

    expect(
      await screen.findByText('Restore finished; waiting for the database to answer…')
    ).toBeInTheDocument()
    expect(screen.queryByText('Restore completed')).not.toBeInTheDocument()

    state.databaseDown = false
    expect(await screen.findByText('Restore completed', {}, { timeout: 8000 })).toBeInTheDocument()
  })

  it('reports a failed restore', async () => {
    savePendingRestore({
      job: RESTORE_JOB,
      instance: INSTANCE,
      backup: DUMP_KEY,
      startedAt: new Date().toISOString(),
    })
    mockBackupsApi({ jobs: [{ name: RESTORE_JOB, phase: 'Failed' }] })
    customRender(<PlatformBackups />)

    expect(await screen.findByText('Restore failed')).toBeInTheDocument()
  })
})
