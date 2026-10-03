import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronsUpDown, ExternalLink, GitBranch, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from 'ui'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'

import { BASE_PATH } from '@/lib/constants'

const API = `${BASE_PATH}/api/self-hosted/branches`
const MAIN = 'main'

type Branch = { name: string; primary: string; host: string | null }
type Branches = {
  enabled: boolean
  parent?: { primary: string; host: string | null }
  current?: string | null
  branches?: Branch[]
}

async function readError(res: Response | undefined, fallback: string): Promise<string> {
  const message = await res
    ?.json()
    .then((json: { error?: { message?: string } }) => json?.error?.message)
    .catch(() => undefined)
  return message ?? fallback
}

async function request<T>(url: string, init: RequestInit | undefined, fallback: string) {
  const res = await fetch(url, init).catch(() => undefined)
  if (!res?.ok) throw new Error(await readError(res, fallback))
  return (await res.json()) as T
}

const studioUrl = (host: string | null | undefined) => (host ? `https://${host}` : undefined)

/**
 * Header selector for self-hosted Studio on a platform that offers branches: a branch is a
 * separate deployment with its own Studio, so picking one opens that Studio. Falls back to
 * the plain project name when the platform does not offer branches.
 */
export function SelfHostedBranchSelector({ projectName }: { projectName: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [deleting, setDeleting] = useState<Branch>()

  const { data } = useQuery({
    queryKey: ['self-hosted-branches'],
    queryFn: () => request<Branches>(API, undefined, 'Failed to load branches'),
    refetchInterval: open ? 5000 : false,
    retry: false,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['self-hosted-branches'] })

  const create = useMutation({
    mutationFn: (name: string) =>
      request<Branch>(
        API,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        },
        'Failed to create the branch'
      ),
    onSuccess: (branch) => {
      toast.success(`Branch ${branch.name} is being created. It takes a few minutes to start.`)
      setNewName('')
      refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: (name: string) =>
      request<unknown>(
        `${API}/${encodeURIComponent(name)}`,
        { method: 'DELETE' },
        'Failed to delete the branch'
      ),
    onSuccess: () => {
      toast.success('Branch deleted')
      setDeleting(undefined)
      refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!data?.enabled) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="grid flex-1 text-left text-sm leading-tight text-foreground">
            <span className="truncate">{projectName}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  const current = data.current ?? MAIN
  const onMain = !data.current
  const branches = data.branches ?? []
  const trimmed = newName.trim()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen} modal={false}>
          <PopoverTrigger asChild>
            <SidebarMenuButton className="flex items-center gap-2 text-sm text-foreground">
              <span className="truncate">{projectName}</span>
              <span className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-foreground-light">
                <GitBranch className="size-3 shrink-0" strokeWidth={1.5} />
                <span className="max-w-32 truncate">{current}</span>
              </span>
              <ChevronsUpDown className="size-3 shrink-0 text-foreground-lighter" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent className="w-96 p-0" side="bottom" align="start">
            <div className="border-b px-3 py-2 text-xs text-foreground-light">
              Each branch is a separate deployment with its own database, storage and Studio.
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              <BranchRow
                name={MAIN}
                isCurrent={onMain}
                href={onMain ? undefined : studioUrl(data.parent?.host)}
              />
              {branches.map((branch) => (
                <BranchRow
                  key={branch.name}
                  name={branch.name}
                  isCurrent={branch.name === data.current}
                  href={branch.name === data.current ? undefined : studioUrl(branch.host)}
                  starting={!branch.host}
                  onDelete={branch.name === data.current ? undefined : () => setDeleting(branch)}
                />
              ))}
            </ul>
            {onMain && (
              <form
                className="flex items-center gap-2 border-t p-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (trimmed) create.mutate(trimmed)
                }}
              >
                <Input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="New branch name"
                  className="h-8"
                />
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={create.isPending}
                  disabled={!trimmed || create.isPending}
                >
                  Create branch
                </Button>
              </form>
            )}
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
      <ConfirmationModal
        variant="destructive"
        visible={deleting !== undefined}
        title="Delete this branch"
        confirmLabel="Delete branch"
        loading={remove.isPending}
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => deleting && remove.mutate(deleting.name)}
      >
        <p className="text-sm text-foreground-light">
          The branch <span className="text-foreground">{deleting?.name}</span>, its database and its
          storage are removed. This cannot be undone.
        </p>
      </ConfirmationModal>
    </SidebarMenu>
  )
}

function BranchRow({
  name,
  isCurrent,
  href,
  starting = false,
  onDelete,
}: {
  name: string
  isCurrent: boolean
  href?: string
  starting?: boolean
  onDelete?: () => void
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-sm">
      <GitBranch className="size-3.5 shrink-0 text-foreground-lighter" strokeWidth={1.5} />
      <span className="flex-1 truncate text-foreground">{name}</span>
      {isCurrent && <span className="text-xs text-foreground-lighter">Current</span>}
      {!isCurrent && starting && (
        <span className="flex items-center gap-1 text-xs text-foreground-lighter">
          <Loader2 className="size-3 animate-spin" /> Starting
        </span>
      )}
      {href && (
        <Button asChild type="default" size="tiny" icon={<ExternalLink />}>
          <a href={href} target="_blank" rel="noreferrer">
            Open
          </a>
        </Button>
      )}
      {onDelete && (
        <Button
          type="text"
          size="tiny"
          className="px-1"
          aria-label={`Delete branch ${name}`}
          icon={<Trash2 />}
          onClick={onDelete}
        />
      )}
    </li>
  )
}
