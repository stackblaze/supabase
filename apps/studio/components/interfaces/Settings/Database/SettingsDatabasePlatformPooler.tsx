import { useParams } from 'common'
import { Card, CardContent, CardHeader, CardTitle } from 'ui'

import CopyButton from '@/components/ui/CopyButton'
import { useProjectSettingsV2Query } from '@/data/config/project-settings-v2-query'

type PlatformPoolerSettings = {
  db_name?: string
  db_user?: string
  pooler_host?: string
  pooler_port?: number
  pooler_mode?: string
}

/**
 * The connection pooler the hosting platform runs for this project (self-hosted Studio on a
 * platform: CloudNativePG's PgBouncer, platformPooler). Rendered only when there is one.
 */
export function SettingsDatabasePlatformPooler() {
  const { ref: projectRef } = useParams()
  const { data } = useProjectSettingsV2Query({ projectRef })
  const settings = (data ?? {}) as PlatformPoolerSettings
  if (!settings.pooler_host) return null

  const port = settings.pooler_port ?? 5432
  const uri = `postgresql://${settings.db_user || 'postgres'}:[YOUR-PASSWORD]@${settings.pooler_host}:${port}/${settings.db_name || 'postgres'}`
  const rows: Array<[string, string]> = [
    ['Pooler', 'PgBouncer (CloudNativePG)'],
    ['Pool mode', settings.pooler_mode || 'transaction'],
    ['Host', settings.pooler_host],
    ['Port', String(port)],
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection pooling</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-light">
          The platform runs a PgBouncer pooler for this project, in transaction mode. Use it for
          serverless functions and other short-lived connections: same users, passwords and database
          as the direct connection. It is reachable from inside the platform, like the database.
        </p>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-foreground-light">{label}</dt>
              <dd className="font-mono break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2">
          <code className="text-xs break-all flex-1">{uri}</code>
          <CopyButton variant="default" text={uri} />
        </div>
      </CardContent>
    </Card>
  )
}
