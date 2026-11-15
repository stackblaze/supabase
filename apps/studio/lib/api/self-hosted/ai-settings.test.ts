import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_AI_OPT_IN_LEVEL,
  getProjectAiOptInLevel,
  setProjectAiOptInLevel,
} from './ai-settings'
import { executeQuery } from './query'
import { PgMetaDatabaseError } from './types'

vi.mock('./query', () => ({ executeQuery: vi.fn() }))

const missing = (code: string) => ({
  data: undefined,
  error: new PgMetaDatabaseError('does not exist', code, 400, 'does not exist'),
})

describe('project AI opt-in level (self-hosted)', () => {
  beforeEach(() => vi.mocked(executeQuery).mockReset())

  it('defaults to schema before anything was saved', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce(missing('3F000'))
    expect(await getProjectAiOptInLevel()).toBe('schema')
    vi.mocked(executeQuery).mockResolvedValueOnce(missing('42P01'))
    expect(await getProjectAiOptInLevel()).toBe('schema')
    vi.mocked(executeQuery).mockResolvedValueOnce({ data: [], error: undefined })
    expect(await getProjectAiOptInLevel()).toBe(DEFAULT_AI_OPT_IN_LEVEL)
  })

  it('reads the saved level back', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce({
      data: [{ value: 'schema_and_log_and_data' }],
      error: undefined,
    })
    expect(await getProjectAiOptInLevel()).toBe('schema_and_log_and_data')
    expect(vi.mocked(executeQuery).mock.calls[0][0]).toEqual({
      query: 'select value from supabase_studio.settings where key = $1',
      parameters: ['ai_opt_in_level'],
    })
  })

  it('ignores an unknown stored value', async () => {
    vi.mocked(executeQuery).mockResolvedValueOnce({
      data: [{ value: 'everything' }],
      error: undefined,
    })
    expect(await getProjectAiOptInLevel()).toBe('schema')
  })

  it('shares nothing when the setting cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(executeQuery).mockResolvedValueOnce({
      data: undefined,
      error: new PgMetaDatabaseError('permission denied', '42501', 400, 'permission denied'),
    })
    expect(await getProjectAiOptInLevel()).toBe('disabled')
  })

  it('saves by creating the table if needed, then upserting the level', async () => {
    vi.mocked(executeQuery).mockResolvedValue({ data: [], error: undefined })

    expect(await setProjectAiOptInLevel('disabled')).toBe('disabled')

    const [setup, upsert] = vi.mocked(executeQuery).mock.calls.map((call) => call[0])
    expect(setup.query).toContain('create schema if not exists supabase_studio')
    expect(setup.query).toContain('create table if not exists supabase_studio.settings')
    expect(setup.query).toContain('revoke all on supabase_studio.settings from public')
    expect(setup.parameters).toBeUndefined()
    expect(upsert.query).toContain('on conflict (key) do update')
    expect(upsert.parameters).toEqual(['ai_opt_in_level', 'disabled'])
  })

  it('refuses an unknown level', async () => {
    await expect(setProjectAiOptInLevel('everything' as never)).rejects.toThrow()
    expect(executeQuery).not.toHaveBeenCalled()
  })
})
