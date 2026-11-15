import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge, Button, Card, CardContent, Switch } from 'ui'
import { Admonition } from 'ui-patterns/Admonition'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import {
  PageSection,
  PageSectionContent,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { PITRForm } from '../PITR/PITRForm'
import {
  clearPendingPitr,
  currentRestore,
  pitrWindowUnix,
  readPendingPitr,
  restoreLabel,
  savePendingPitr,
  type PendingPitr,
  type PitrStatus,
} from './pitr-state'
import { BASE_PATH } from '@/lib/constants'

const API = `${BASE_PATH}/api/self-hosted/backups/pitr`

async function call<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch(API, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => undefined)
  if (!res?.ok) {
    const message = await res
      ?.json()
      .then((j: { error?: { message?: string } }) => j?.error?.message)
      .catch(() => undefined)
    throw new Error(message ?? 'The platform did not answer')
  }
  return (await res.json()) as T
}

const fmt = (v?: string | null) => (v ? dayjs(v).format('DD MMM YYYY, HH:mm:ss') : '—')

/**
 * Database › Backups › Point in time, on the platform (kubero-server #2407): turn PITR on
 * with a retention (7, 14 or 28 days, capped by the plan), see the window you can restore
 * to, and restore the project to a second inside it. Like the Supabase platform the
 * project's database is replaced: the platform recovers it into a new database from the
 * WAL archive, then moves every service onto it (Studio restarts). The previous database
 * is kept until it is deleted on the dashboard.
 */
export const PlatformPitr = () => {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<PendingPitr | undefined>(() => readPendingPitr())
  const [retention, setRetention] = useState<number>()
  const [picking, setPicking] = useState(false)
  const [confirm, setConfirm] = useState<{ unix: number; label: string; utc: string }>()

  const status = useQuery({
    queryKey: ['self-hosted', 'platform-pitr'],
    queryFn: () => call<PitrStatus>('GET'),
    // During the cutover Studio itself restarts: keep asking until it answers again.
    retry: pending ? true : 3,
    refetchInterval: (q) => {
      const r = currentRestore(q.state.data)?.restore
      const inFlight = !!r && r.cutover !== 'done' && r.cutover !== 'failed'
      return pending || inFlight ? 5000 : 30000
    },
  })
  const st = status.data
  const running = currentRestore(st)
  const windowUnix = st ? pitrWindowUnix(st) : null
  const retentionValue = retention ?? st?.retentionDays ?? st?.retentionChoices[0] ?? 7

  const save = useMutation({
    mutationFn: (body: { enabled: boolean; retentionDays?: number }) =>
      call<PitrStatus>('PUT', body),
    onSuccess: (next, body) => {
      queryClient.setQueryData(['self-hosted', 'platform-pitr'], next)
      toast.success(
        body.enabled
          ? 'Point-in-time recovery is on; the first base backup is running'
          : 'Point-in-time recovery is off; the archive is kept for its retention'
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const restore = useMutation({
    mutationFn: (targetTime: string) => call<{ message: string }>('POST', { targetTime }),
    onSuccess: (result, targetTime) => {
      const p = { targetTime, startedAt: new Date().toISOString() }
      savePendingPitr(p)
      setPending(p)
      setConfirm(undefined)
      setPicking(false)
      toast.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['self-hosted', 'platform-pitr'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (status.isPending) return <GenericSkeletonLoader />
  if (status.isError && !pending)
    return (
      <Admonition type="warning" title="Could not load point-in-time recovery">
        {status.error.message}
      </Admonition>
    )

  const finished = running?.restore.cutover === 'done' || running?.restore.cutover === 'failed'
  // A finished restore is shown to the browser that started it, until dismissed.
  const showRestore = !!pending || (!!running && !finished)

  return (
    <div className="flex flex-col gap-y-8">
      {showRestore && (
        <Admonition
          type={running?.restore.cutover === 'failed' ? 'warning' : 'default'}
          title={
            running ? restoreLabel(running.restore) : 'Restoring the project (Studio restarts)'
          }
        >
          <p>
            <span>Restoring to {fmt(running?.restore.targetTime ?? pending?.targetTime)} UTC.</span>
            {running?.restore.error && <span> {running.restore.error}</span>}
          </p>
          {!finished && (
            <p className="flex items-center gap-2 mt-1">
              <Loader2Icon className="animate-spin" size={14} /> This page updates by itself.
            </p>
          )}
          {finished && (
            <Button
              className="mt-2"
              variant="default"
              onClick={() => {
                clearPendingPitr()
                setPending(undefined)
                queryClient.invalidateQueries()
              }}
            >
              Dismiss
            </Button>
          )}
        </Admonition>
      )}

      {st && (
        <PageSection>
          <PageSectionMeta>
            <PageSectionSummary>
              <PageSectionTitle>Point-in-time recovery</PageSectionTitle>
              <p className="text-sm text-foreground-light">
                Every change is archived continuously, so the database can be restored to any second
                inside the retention window. Off by default; the archive is billed as backup
                storage.
              </p>
            </PageSectionSummary>
          </PageSectionMeta>
          <PageSectionContent>
            <Card>
              <CardContent className="flex flex-col gap-4 py-4">
                {!st.available && !st.enabled && (
                  <Admonition type="default" title="Not available">
                    {st.unavailableReason}
                  </Admonition>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">Enable point-in-time recovery</p>
                    <p className="text-xs text-foreground-lighter">
                      {st.enabled
                        ? `Keeping ${st.retentionDays ?? '?'} days of history`
                        : st.archiveKeptUntil
                          ? `Off. The archive is kept until ${fmt(st.archiveKeptUntil)}, then deleted.`
                          : 'Off'}
                    </p>
                  </div>
                  <Switch
                    checked={st.enabled}
                    disabled={save.isPending || (!st.available && !st.enabled)}
                    onCheckedChange={(on) =>
                      save.mutate(
                        on ? { enabled: true, retentionDays: retentionValue } : { enabled: false }
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground-light">Retention</span>
                  {st.retentionChoices.map((d) => (
                    <Button
                      key={d}
                      variant={d === retentionValue ? 'primary' : 'default'}
                      disabled={save.isPending || !st.available}
                      onClick={() => {
                        setRetention(d)
                        if (st.enabled) save.mutate({ enabled: true, retentionDays: d })
                      }}
                    >
                      {d} days
                    </Button>
                  ))}
                </div>
                {st.enabled && (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <dt className="text-foreground-light">Earliest restore point</dt>
                    <dd>{fmt(st.firstRecoverableTime)}</dd>
                    <dt className="text-foreground-light">Latest archived change</dt>
                    <dd>{fmt(st.lastRecoverableTime)}</dd>
                    <dt className="text-foreground-light">Last base backup</dt>
                    <dd>{fmt(st.lastBaseBackupTime)}</dd>
                    <dt className="text-foreground-light">WAL archiving</dt>
                    <dd>
                      {st.walArchiving.healthy === false ? (
                        <Badge variant="destructive">Failing</Badge>
                      ) : st.walArchiving.healthy ? (
                        <Badge variant="success">Healthy</Badge>
                      ) : (
                        <Badge>Starting</Badge>
                      )}
                    </dd>
                  </dl>
                )}
              </CardContent>
            </Card>
          </PageSectionContent>
        </PageSection>
      )}

      {st?.enabled && (
        <PageSection>
          <PageSectionMeta>
            <PageSectionSummary>
              <PageSectionTitle>Restore to a point in time</PageSectionTitle>
              <p className="text-sm text-foreground-light">
                Everything written after the chosen time is discarded. The project is down while its
                services move to the restored database.
              </p>
            </PageSectionSummary>
          </PageSectionMeta>
          <PageSectionContent>
            {!windowUnix ? (
              <Admonition type="default" title="No restore point yet">
                The first base backup is still running; restores are possible once it finishes.
              </Admonition>
            ) : !picking ? (
              <Button
                variant="default"
                disabled={!!running && !finished}
                onClick={() => setPicking(true)}
              >
                Start a restore
              </Button>
            ) : (
              <PITRForm
                earliestAvailableBackupUnix={windowUnix.earliest}
                latestAvailableBackupUnix={windowUnix.latest}
                disabled={restore.isPending}
                onSubmit={(p) =>
                  setConfirm({
                    unix: p.recoveryTimeTargetUnix,
                    label: p.recoveryTimeString,
                    utc: p.recoveryTimeStringUtc,
                  })
                }
              />
            )}
          </PageSectionContent>
        </PageSection>
      )}

      <ConfirmationModal
        visible={!!confirm}
        variant="warning"
        title="Restore the project to this point in time?"
        confirmLabel="I understand, begin restore"
        loading={restore.isPending}
        onCancel={() => setConfirm(undefined)}
        onConfirm={() => confirm && restore.mutate(new Date(confirm.unix * 1000).toISOString())}
      >
        <p className="text-sm">
          The database will be restored to <strong>{confirm?.label}</strong> ({confirm?.utc} UTC).
          Every change after it is lost, including storage and auth changes. The project is
          unavailable until its services have moved to the restored database; the previous database
          is kept until you delete it on the dashboard.
        </p>
      </ConfirmationModal>
    </div>
  )
}
