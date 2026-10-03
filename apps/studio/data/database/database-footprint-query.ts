import { useQuery } from '@tanstack/react-query'

import { databaseKeys } from './keys'
import { executeSql } from '@/data/sql/execute-sql-mutation'
import { ResponseError, UseCustomQueryOptions } from '@/types'

export type DatabaseFootprintVariables = {
  projectRef?: string
  connectionString?: string | null
}

/**
 * What a project uses of the Postgres server it lives on, measured on its own database only:
 * size, open connections and the connection limit that applies to it (the database's, else
 * its owner's, else the server's).
 */
const DATABASE_FOOTPRINT_SQL = /* SQL */ `
select
  pg_database_size(current_database())::bigint as size_bytes,
  (select count(*) from pg_stat_activity where datname = current_database())::int as connections,
  coalesce(
    nullif(d.datconnlimit, -1),
    nullif(r.rolconnlimit, -1),
    current_setting('max_connections')::int
  ) as connection_limit
from pg_database d
join pg_roles r on r.oid = d.datdba
where d.datname = current_database()
`.trim()

export async function getDatabaseFootprint(
  { projectRef, connectionString }: DatabaseFootprintVariables,
  signal?: AbortSignal
) {
  const { result } = await executeSql(
    {
      projectRef,
      connectionString,
      sql: DATABASE_FOOTPRINT_SQL,
      queryKey: ['database-footprint'],
    },
    signal
  )

  const row = result?.[0]
  if (!row) throw new Error('Error fetching database footprint')

  return {
    sizeBytes: Number(row.size_bytes),
    connections: Number(row.connections),
    connectionLimit: Number(row.connection_limit),
  }
}

export type DatabaseFootprintData = Awaited<ReturnType<typeof getDatabaseFootprint>>
export type DatabaseFootprintError = ResponseError

export const useDatabaseFootprintQuery = <TData = DatabaseFootprintData>(
  { projectRef, connectionString }: DatabaseFootprintVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<DatabaseFootprintData, DatabaseFootprintError, TData> = {}
) =>
  useQuery<DatabaseFootprintData, DatabaseFootprintError, TData>({
    queryKey: databaseKeys.databaseFootprint(projectRef),
    queryFn: ({ signal }) => getDatabaseFootprint({ projectRef, connectionString }, signal),
    enabled: enabled && typeof projectRef !== 'undefined',
    ...options,
  })
