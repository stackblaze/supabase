import { getDatabaseSizeSql, safeSql } from '@supabase/pg-meta'
import { useQuery } from '@tanstack/react-query'

import { databaseKeys } from './keys'
import { unguarded } from '@/data/fetchers'
import { executeSql } from '@/data/sql/execute-sql-mutation'
import { IS_PLATFORM } from '@/lib/constants'
import type { StudioError } from '@/lib/errors/studio-errors'
import { UseCustomQueryOptions } from '@/types'

// Self-hosted projects can share a Postgres server: measure this database only. The platform
// query sums every database, which other tenants' databases refuse.
const OWN_DATABASE_SIZE_SQL = safeSql`select pg_database_size(current_database())::bigint as db_size`

export type DatabaseSizeVariables = {
  projectRef?: string
  connectionString?: string | null
}

export async function getDatabaseSize(
  { projectRef, connectionString }: DatabaseSizeVariables,
  signal?: AbortSignal
) {
  const sql = IS_PLATFORM ? getDatabaseSizeSql() : OWN_DATABASE_SIZE_SQL

  const { result } = await executeSql(
    {
      projectRef,
      connectionString,
      sqlOrigin: 'studio',
      queryName: 'database-size',
      sql,
      queryKey: ['database-size'],
      grant: unguarded.migrating,
    },
    signal
  )

  const rawSize = result?.[0]?.db_size
  const dbSize = typeof rawSize === 'string' ? Number(rawSize) : rawSize
  if (typeof dbSize !== 'number' || Number.isNaN(dbSize)) {
    throw new Error('Error fetching dbSize')
  }

  return dbSize
}

export type DatabaseSizeData = Awaited<ReturnType<typeof getDatabaseSize>>
export type DatabaseSizeError = StudioError

export const useDatabaseSizeQuery = <TData = DatabaseSizeData>(
  { projectRef, connectionString }: DatabaseSizeVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DatabaseSizeData, DatabaseSizeError, TData> = {}
) =>
  useQuery<DatabaseSizeData, DatabaseSizeError, TData>({
    queryKey: databaseKeys.databaseSize(projectRef),
    queryFn: ({ signal }) => getDatabaseSize({ projectRef, connectionString }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
