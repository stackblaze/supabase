import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { DatabaseIcon, Loader2Icon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'ui'
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

import { BASE_PATH } from '@/lib/constants'

const API = `${BASE_PATH}/api/self-hosted/backups`

type Dump = { key: string; size: number; lastModified?: string }
type Job = { name: string; phase: string; startedAt?: string | null; finishedAt?: string | null }
type Backups = {
  enabled: boolean
  pipeline?: string
  phase?: string
  instance?: string
  dumps?: Dump[]
  jobs?: Job[]
}
type Cadence = { id: string; enabled: boolean; retentionHours: number }
type Schedule = { cadences: Cadence[]; dbNames: string[] | null; configured: boolean }

async function readError(res: Response | undefined, fallback: string): Promise<string> {
  const message = await res
    ?.json()
    .then((json: { error?: { message?: string } }) => json?.error?.message)
    .catch(() => undefined)
  return message ?? fallback
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url).catch(() => undefined)
  if (!res?.ok) throw new Error(await readError(res, fallback))
  return (await res.json()) as T
}

type RestoreCopy = { job: string; from: string; to: string; displayName?: string }

async function sendJson<T>(
  url: string,
  init: RequestInit,
  fallback: string
): Promise<T | undefined> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  }).catch(() => undefined)
  if (!res?.ok) throw new Error(await readError(res, fallback))
  return (await res.json().catch(() => undefined)) as T | undefined
}

async function send(url: string, init: RequestInit, fallback: string): Promise<void> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  }).catch(() => undefined)
  if (!res?.ok) throw new Error(await readError(res, fallback))
}

const formatSize = (bytes: number) => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
const formatTime = (value?: string | null) =>
  value ? dayjs(value).format('DD MMM YYYY, HH:mm:ss') : '—'
const fileName = (key: string) => key.split('/').pop() ?? key
const cadenceLabel = (id: string) =>
  ({ hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' })[id] ?? id

/**
 * The platform's backups of this deployment's database: scheduled dumps kept
 * in the region bucket, a "Back up now" button, restore (into a NEW database
 * next to this one; nothing running changes), delete, and the dump schedule.
 */
export const PlatformBackups = () => {
  const queryClient = useQueryClient()
  const [restoring, setRestoring] = useState<Dump>()
  // The database the last restore created, shown until dismissed.
  const [restoredTo, setRestoredTo] = useState<string>()
  const [deleting, setDeleting] = useState<Dump>()

  const backups = useQuery({
    queryKey: ['self-hosted', 'platform-backups'],
    queryFn: () => getJson<Backups>(API, 'Could not load backups'),
    refetchInterval: (query) =>
      (query.state.data?.jobs ?? []).some((j) => j.phase === 'Running') ? 5000 : 60000,
  })
  const schedule = useQuery({
    queryKey: ['self-hosted', 'platform-backup-schedule'],
    queryFn: () => getJson<Schedule>(`${API}/schedule`, 'Could not load the schedule'),
    enabled: backups.data?.enabled === true,
  })
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['self-hosted', 'platform-backups'] })
    queryClient.invalidateQueries({ queryKey: ['self-hosted', 'platform-backup-schedule'] })
  }

  const backupNow = useMutation({
    mutationFn: () => send(API, { method: 'POST' }, 'Could not start the backup'),
    onSuccess: () => {
      toast.success('Backup started; it appears in the list when it finishes')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const restore = useMutation({
    mutationFn: (dump: Dump) =>
      sendJson<RestoreCopy>(
        `${API}/restore`,
        { method: 'POST', body: JSON.stringify({ key: dump.key }) },
        'Could not start the restore'
      ),
    onSuccess: (result) => {
      const name = result?.displayName || result?.to || 'a new database'
      toast.success(`Restoring into ${name}`)
      setRestoredTo(name)
      setRestoring(undefined)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: (dump: Dump) =>
      send(
        `${API}/delete?key=${encodeURIComponent(dump.key)}`,
        { method: 'DELETE' },
        'Could not delete the backup'
      ),
    onSuccess: () => {
      toast.success('Backup deleted')
      setDeleting(undefined)
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const saveSchedule = useMutation({
    mutationFn: (cadences: Cadence[]) =>
      send(
        `${API}/schedule`,
        {
          method: 'PUT',
          body: JSON.stringify({ cadences }),
        },
        'Could not save the schedule'
      ),
    onSuccess: () => {
      toast.success('Schedule saved')
      invalidate()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (backups.isPending) return <GenericSkeletonLoader />
  if (backups.isError) {
    return (
      <Admonition
        type="destructive"
        title="Could not load backups"
        description={backups.error.message}
      />
    )
  }
  if (!backups.data.enabled) {
    return (
      <Admonition
        type="default"
        title="Platform backups are not wired to this Studio"
        description="This Studio was deployed without a platform token (KUBERO_APP_TOKEN). Redeploy from the current template to manage backups here."
      />
    )
  }

  const dumps = backups.data.dumps ?? []
  const jobs = backups.data.jobs ?? []
  const running = jobs.filter((j) => j.phase === 'Running')
  const instance = backups.data.instance ?? ''

  return (
    <>
      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Scheduled backups</PageSectionTitle>
          </PageSectionSummary>
          <p className="text-sm text-foreground-light">
            Full dumps of <span className="text-foreground">{instance}</span> taken by the platform
            on the schedule below and kept in the region's backup bucket. Restoring loads the chosen
            dump into a new database next to this one; nothing running changes.
          </p>
        </PageSectionMeta>
        <PageSectionContent>
          {restoredTo && (
            <Admonition
              type="note"
              className="mb-4"
              title={`Restoring into the new database ${restoredTo}`}
              description="This project keeps using its current database. Connect the new one from the StackBlaze dashboard if you want to use it."
            />
          )}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-foreground-light">
                {running.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <Loader2Icon size={14} className="animate-spin" />
                    <span>
                      {running.length === 1
                        ? 'A job is running'
                        : `${running.length} jobs are running`}
                    </span>
                  </span>
                ) : (
                  `${dumps.length} backup${dumps.length === 1 ? '' : 's'} kept`
                )}
              </div>
              <Button
                variant="primary"
                icon={<DatabaseIcon />}
                loading={backupNow.isPending}
                onClick={() => backupNow.mutate()}
              >
                Back up now
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Taken</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="w-48" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dumps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-foreground-light">
                        No backups yet. The schedule below takes the first one, or use Back up now.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dumps.map((dump) => (
                      <TableRow key={dump.key}>
                        <TableCell className="text-foreground">
                          {formatTime(dump.lastModified)}
                        </TableCell>
                        <TableCell className="text-foreground-light font-mono text-xs">
                          {fileName(dump.key)}
                        </TableCell>
                        <TableCell className="text-foreground-light">
                          {formatSize(dump.size)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="default"
                              size="tiny"
                              icon={<RotateCcwIcon />}
                              onClick={() => setRestoring(dump)}
                            >
                              Restore
                            </Button>
                            <Button
                              variant="default"
                              size="tiny"
                              icon={<Trash2Icon />}
                              onClick={() => setDeleting(dump)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
            {jobs.length > 0 && (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recent jobs</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Finished</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.slice(0, 8).map((job) => (
                      <TableRow key={job.name}>
                        <TableCell className="font-mono text-xs text-foreground-light">
                          {job.name}
                        </TableCell>
                        <TableCell className="text-foreground-light">
                          {formatTime(job.startedAt)}
                        </TableCell>
                        <TableCell className="text-foreground-light">
                          {formatTime(job.finishedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              job.phase === 'Completed'
                                ? 'success'
                                : job.phase === 'Failed'
                                  ? 'destructive'
                                  : 'default'
                            }
                          >
                            {job.phase}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </PageSectionContent>
      </PageSection>

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Schedule</PageSectionTitle>
          </PageSectionSummary>
          <p className="text-sm text-foreground-light">
            How often the platform dumps this environment's databases and how long each cadence is
            kept.
          </p>
        </PageSectionMeta>
        <PageSectionContent>
          {schedule.isPending ? (
            <GenericSkeletonLoader />
          ) : schedule.isError ? (
            <Admonition
              type="warning"
              title="Could not load the schedule"
              description={schedule.error.message}
            />
          ) : (
            <Card>
              <CardContent className="flex flex-col gap-3">
                {schedule.data.cadences.map((cadence) => (
                  <div key={cadence.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={cadence.enabled}
                        disabled={saveSchedule.isPending}
                        onCheckedChange={(checked) =>
                          saveSchedule.mutate(
                            schedule.data.cadences.map((c) =>
                              c.id === cadence.id ? { ...c, enabled: checked } : c
                            )
                          )
                        }
                      />
                      <span className="text-sm text-foreground">{cadenceLabel(cadence.id)}</span>
                    </div>
                    <span className="text-sm text-foreground-light">
                      <span>kept </span>
                      <span>
                        {cadence.retentionHours >= 48
                          ? `${Math.round(cadence.retentionHours / 24)} days`
                          : `${cadence.retentionHours} hours`}
                      </span>
                    </span>
                  </div>
                ))}
                <p className="text-xs text-foreground-lighter">
                  {schedule.data.configured
                    ? (schedule.data.dbNames ?? []).length <= 1
                      ? 'Covers this database.'
                      : `Covers ${(schedule.data.dbNames ?? []).length} databases in this environment, including this one.`
                    : 'No schedule saved yet; these are the platform defaults. Turning a cadence on saves a schedule that covers this database.'}
                </p>
              </CardContent>
            </Card>
          )}
        </PageSectionContent>
      </PageSection>

      <ConfirmationModal
        visible={restoring !== undefined}
        title="Restore into a new database"
        confirmLabel="Restore into a new database"
        loading={restore.isPending}
        onCancel={() => setRestoring(undefined)}
        onConfirm={() => restoring && restore.mutate(restoring)}
      >
        <div className="flex flex-col gap-3 text-sm text-foreground-light">
          <p>
            The backup from{' '}
            <span className="text-foreground">{formatTime(restoring?.lastModified)}</span> is
            restored into a <span className="text-foreground">new database</span> next to{' '}
            <span className="text-foreground">{instance}</span>.
          </p>
          <p>
            Nothing running changes: this project keeps using{' '}
            <span className="text-foreground">{instance}</span>. Connect the new database from the
            StackBlaze dashboard if you want to use it.
          </p>
        </div>
      </ConfirmationModal>
      <ConfirmationModal
        variant="destructive"
        visible={deleting !== undefined}
        title="Delete this backup"
        confirmLabel="Delete"
        loading={remove.isPending}
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      >
        <p className="text-sm text-foreground-light">
          <span className="font-mono text-foreground">{fileName(deleting?.key ?? '')}</span> is
          removed from the bucket. This cannot be undone.
        </p>
      </ConfirmationModal>
    </>
  )
}
