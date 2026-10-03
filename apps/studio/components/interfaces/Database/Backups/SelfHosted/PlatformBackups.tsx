import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Database, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
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
 * in the region bucket, a "Back up now" button, restore (overwrites the live
 * database, confirmed by typing its name), delete, and the dump schedule.
 */
export const PlatformBackups = () => {
  const queryClient = useQueryClient()
  const [restoring, setRestoring] = useState<Dump>()
  const [confirmText, setConfirmText] = useState('')
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
      send(
        `${API}/restore`,
        { method: 'POST', body: JSON.stringify({ key: dump.key, confirm: confirmText }) },
        'Could not start the restore'
      ),
    onSuccess: () => {
      toast.success('Restore started; the database is replaced when the job finishes')
      setRestoring(undefined)
      setConfirmText('')
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
          body: JSON.stringify({ cadences, dbNames: schedule.data?.dbNames ?? null }),
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
            on the schedule below and kept in the region's backup bucket. Restoring replaces the
            live database with the chosen dump.
          </p>
        </PageSectionMeta>
        <PageSectionContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-foreground-light">
                {running.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {running.length === 1
                      ? 'A job is running'
                      : `${running.length} jobs are running`}
                  </span>
                ) : (
                  `${dumps.length} backup${dumps.length === 1 ? '' : 's'} kept`
                )}
              </div>
              <Button
                variant="primary"
                icon={<Database />}
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
                              icon={<RotateCcw />}
                              onClick={() => {
                                setConfirmText('')
                                setRestoring(dump)
                              }}
                            >
                              Restore
                            </Button>
                            <Button
                              variant="default"
                              size="tiny"
                              icon={<Trash2 />}
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
                      kept{' '}
                      {cadence.retentionHours >= 48
                        ? `${Math.round(cadence.retentionHours / 24)} days`
                        : `${cadence.retentionHours} hours`}
                    </span>
                  </div>
                ))}
                {!schedule.data.configured && (
                  <p className="text-xs text-foreground-lighter">
                    No schedule saved yet; these are the platform defaults.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </PageSectionContent>
      </PageSection>

      <ConfirmationModal
        variant="destructive"
        visible={restoring !== undefined}
        title="Restore this backup"
        confirmLabel="Restore"
        loading={restore.isPending}
        disabled={confirmText !== instance}
        onCancel={() => setRestoring(undefined)}
        onConfirm={() => restoring && restore.mutate(restoring)}
      >
        <div className="flex flex-col gap-3 text-sm text-foreground-light">
          <p>
            The live database <span className="text-foreground">{instance}</span> is replaced with
            the backup from{' '}
            <span className="text-foreground">{formatTime(restoring?.lastModified)}</span>.
            Everything written since is lost. Take a backup first if in doubt.
          </p>
          <p>
            Type <span className="font-mono text-foreground">{instance}</span> to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={instance}
          />
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
