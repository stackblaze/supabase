import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ isPlatform: false }))
vi.mock('@/lib/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/constants')>()),
  get IS_PLATFORM() {
    return platform.isPlatform
  },
}))

const { NO_DATA_PERMISSIONS, NO_DATA_PERMISSIONS_SELF_HOSTED, toModelExecuteSqlOutput } =
  await import('./execute-sql-output')

const output = {
  rows: [{ product: 'Lamp', rating: 4.8 }],
  optInLevel: 'schema_and_log_and_data' as const,
}

describe('execute_sql output for the model', () => {
  afterEach(() => {
    platform.isPlatform = false
  })

  it('shares rows only at the data level', () => {
    expect(toModelExecuteSqlOutput(output, 'schema_and_log_and_data')).toEqual(output.rows)
    for (const level of ['disabled', 'schema', 'schema_and_log'] as const) {
      expect(toModelExecuteSqlOutput(output, level)).toBe(NO_DATA_PERMISSIONS_SELF_HOSTED)
    }
  })

  it('self-hosted: states that rows were withheld, with nothing the model could act on', () => {
    const note = toModelExecuteSqlOutput(output, 'schema') as string
    expect(note).not.toMatch(
      /opt[-_ ]in|update_opt_in_level|organi[sz]ation|change|call|setting.*to/i
    )
  })

  it('keeps the platform wording on the hosted platform', () => {
    platform.isPlatform = true
    expect(toModelExecuteSqlOutput(output, 'schema')).toBe(NO_DATA_PERMISSIONS)
  })
})
