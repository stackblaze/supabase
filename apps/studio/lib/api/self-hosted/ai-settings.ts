import { executeQuery } from './query'
import { PgMetaDatabaseError } from './types'
import type { AiOptInLevel } from '@/hooks/misc/useOrgOptedIntoAi'
import { optInLevelSchema } from '@/lib/ai/opt-in-level'

/**
 * Self-hosted Studio's AI data setting, per project: how much of the project the AI model may
 * see (Supabase's four levels). Self-hosted has no organization settings, so the level lives in
 * the project's own Postgres, in a small table Studio creates on first save:
 * `supabase_studio.settings`. It survives Studio restarts and redeploys, moves with the database
 * (including backups and restores), needs no platform support (plain self-hosted works too) and
 * is outside the schemas PostgREST exposes. Read at request time by every AI route.
 */
export const DEFAULT_AI_OPT_IN_LEVEL: AiOptInLevel = 'schema'

const SETTING_KEY = 'ai_opt_in_level'

// Postgres: undefined_table, invalid_schema_name. The table does not exist before the first save.
const NOT_CREATED_YET = new Set(['42P01', '3F000'])

export async function getProjectAiOptInLevel(): Promise<AiOptInLevel> {
  const { data, error } = await executeQuery<{ value: unknown }>({
    query: 'select value from supabase_studio.settings where key = $1',
    parameters: [SETTING_KEY],
  })
  if (error) {
    if (error instanceof PgMetaDatabaseError && NOT_CREATED_YET.has(error.code)) {
      return DEFAULT_AI_OPT_IN_LEVEL
    }
    // The setting exists but can't be read: share nothing rather than guess.
    console.error('Could not read the AI opt-in level:', error.message)
    return 'disabled'
  }
  const parsed = optInLevelSchema.safeParse(data?.[0]?.value)
  return parsed.success ? parsed.data : DEFAULT_AI_OPT_IN_LEVEL
}

// Idempotent; run before each save so a project created before this feature gets the table.
const SETUP_SQL = `
create schema if not exists supabase_studio;
revoke all on schema supabase_studio from public;
create table if not exists supabase_studio.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
revoke all on supabase_studio.settings from public;
comment on table supabase_studio.settings is 'Supabase Studio settings of this project (self-hosted), e.g. the AI data level.';
`

// A parameterized query holds one statement, so the upsert runs on its own.
const UPSERT_SQL = `
insert into supabase_studio.settings (key, value, updated_at)
values ($1, to_jsonb($2::text), now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
`

export async function setProjectAiOptInLevel(level: AiOptInLevel): Promise<AiOptInLevel> {
  const valid = optInLevelSchema.parse(level)
  const setup = await executeQuery({ query: SETUP_SQL })
  if (setup.error) throw setup.error
  const { error } = await executeQuery({ query: UPSERT_SQL, parameters: [SETTING_KEY, valid] })
  if (error) throw error
  return valid
}
