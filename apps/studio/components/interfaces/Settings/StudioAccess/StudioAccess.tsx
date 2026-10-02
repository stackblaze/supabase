import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Form,
  FormControl,
  FormField,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'ui'
import { Admonition } from 'ui-patterns/Admonition'
import ConfirmationModal from 'ui-patterns/Dialogs/ConfirmationModal'
import { FormItemLayout } from 'ui-patterns/form/FormItemLayout/FormItemLayout'
import {
  PageSection,
  PageSectionContent,
  PageSectionMeta,
  PageSectionSummary,
  PageSectionTitle,
} from 'ui-patterns/PageSection'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'
import z from 'zod'

import { fetchSelfHostedLoginStatus } from '@/hooks/misc/useSelfHostedLoginEnabled'
import { useSelfHostedSession } from '@/hooks/misc/useSelfHostedSession'
import { BASE_PATH } from '@/lib/constants'

const ADMINS_API = `${BASE_PATH}/api/self-hosted/admins`

type Admin = {
  id: string
  email: string
  created_at: string | null
  last_sign_in_at: string | null
}
type AddResult = { admin: Admin; created: boolean; emailSent: boolean; emailError?: string }

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .refine((value) => value === '' || value.length >= 8, 'At least 8 characters'),
  sendEmail: z.boolean(),
})

async function readError(res: Response | undefined, fallback: string): Promise<string> {
  const message = await res
    ?.json()
    .then((json: { error?: { message?: string } }) => json?.error?.message)
    .catch(() => undefined)
  return message ?? fallback
}

async function fetchAdmins(): Promise<Admin[]> {
  const res = await fetch(ADMINS_API).catch(() => undefined)
  if (!res?.ok) throw new Error(await readError(res, 'Could not load Studio admins'))
  const { admins } = (await res.json()) as { admins: Admin[] }
  return admins
}

async function addAdmin(values: z.infer<typeof schema>): Promise<AddResult> {
  const res = await fetch(ADMINS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: values.email.trim(),
      ...(values.password ? { password: values.password } : {}),
      sendEmail: values.sendEmail,
    }),
  }).catch(() => undefined)
  if (!res?.ok) throw new Error(await readError(res, 'Could not add the admin'))
  return (await res.json()) as AddResult
}

async function removeAdmin(id: string): Promise<void> {
  const res = await fetch(`${ADMINS_API}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
    () => undefined
  )
  if (!res?.ok) throw new Error(await readError(res, 'Could not remove the admin'))
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—')

/**
 * Who can sign in to this self-hosted Studio with an email: the Auth users
 * flagged as Studio admins. The gateway's dashboard password keeps working as
 * a fallback, so there is no way to lock yourself out from here.
 */
export const StudioAccess = () => {
  const queryClient = useQueryClient()
  const session = useSelfHostedSession()
  const [removing, setRemoving] = useState<Admin>()

  const { data: status } = useQuery({
    queryKey: ['self-hosted', 'login-status'],
    queryFn: fetchSelfHostedLoginStatus,
  })
  const emailSignIn = status?.methods.email === true

  const {
    data: admins,
    error: adminsError,
    isPending,
  } = useQuery({
    queryKey: ['self-hosted', 'studio-admins'],
    queryFn: fetchAdmins,
    enabled: emailSignIn,
  })

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', sendEmail: true },
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['self-hosted', 'studio-admins'] })

  const add = useMutation({
    mutationFn: addAdmin,
    onSuccess: (result) => {
      invalidate()
      form.reset()
      const who = result.admin.email
      if (result.emailSent) {
        toast.success(
          `${who} ${result.created ? 'added' : 'given Studio access'}; a link to set the password is on its way`
        )
      } else if (result.emailError) {
        toast.warning(
          `${who} has Studio access, but the email could not be sent: ${result.emailError}`
        )
      } else {
        toast.success(`${who} ${result.created ? 'added' : 'given Studio access'}`)
      }
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const remove = useMutation({
    mutationFn: removeAdmin,
    onSuccess: () => {
      invalidate()
      setRemoving(undefined)
      toast.success('Studio access removed')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const onSubmit: SubmitHandler<z.infer<typeof schema>> = (values) => add.mutate(values)

  if (status && !status.enabled) {
    return (
      <Admonition
        type="default"
        title="Sign-in is off"
        description="Set STUDIO_SELF_HOSTED_LOGIN=true with DASHBOARD_USERNAME and DASHBOARD_PASSWORD on the Studio container to turn on sign-in."
      />
    )
  }
  if (status && !emailSignIn) {
    return (
      <Admonition
        type="warning"
        title="Email sign-in is not available"
        description="Studio needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY to use this project's Auth for sign-in. Only the dashboard password works until then."
      />
    )
  }

  return (
    <>
      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Studio admins</PageSectionTitle>
          </PageSectionSummary>
          <p className="text-sm text-foreground-light">
            Auth users who can sign in to Studio with their email. Access is the{' '}
            <code className="text-xs">studio_admin</code> flag in the user's app metadata; only the
            service key can set it. The dashboard password keeps working as a fallback.
          </p>
        </PageSectionMeta>
        <PageSectionContent>
          {!status || (isPending && emailSignIn) ? (
            <GenericSkeletonLoader />
          ) : adminsError ? (
            <Admonition
              type="destructive"
              title="Could not load Studio admins"
              description={adminsError.message}
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Last sign in</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(admins ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-foreground-light">
                        No one yet. Add the first admin below; the dashboard password keeps working.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (admins ?? []).map((admin) => (
                      <TableRow key={admin.id}>
                        <TableCell className="text-foreground">
                          {admin.email}
                          {session?.kind === 'user' && session.email === admin.email && (
                            <span className="ml-2 text-xs text-foreground-lighter">(you)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-foreground-light">
                          {formatDate(admin.created_at)}
                        </TableCell>
                        <TableCell className="text-foreground-light">
                          {formatDate(admin.last_sign_in_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="default" size="tiny" onClick={() => setRemoving(admin)}>
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </PageSectionContent>
      </PageSection>

      <PageSection>
        <PageSectionMeta>
          <PageSectionSummary>
            <PageSectionTitle>Add an admin</PageSectionTitle>
          </PageSectionSummary>
          <p className="text-sm text-foreground-light">
            An existing Auth user gets the flag; a new email becomes a confirmed user. Without a
            password they set one through the emailed link, which needs SMTP on the Auth service.
          </p>
        </PageSectionMeta>
        <PageSectionContent>
          <Card>
            <CardContent>
              <Form {...form}>
                <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
                  <FormField
                    name="email"
                    control={form.control}
                    render={({ field }) => (
                      <FormItemLayout label="Email" layout="flex-row-reverse">
                        <FormControl>
                          <Input
                            type="email"
                            autoComplete="off"
                            placeholder="colleague@example.com"
                            {...field}
                            disabled={add.isPending}
                          />
                        </FormControl>
                      </FormItemLayout>
                    )}
                  />
                  <FormField
                    name="password"
                    control={form.control}
                    render={({ field }) => (
                      <FormItemLayout
                        label="Password"
                        description="Optional. Leave empty to let them choose one through the emailed link."
                        layout="flex-row-reverse"
                      >
                        <FormControl>
                          <Input
                            type="password"
                            autoComplete="new-password"
                            {...field}
                            disabled={add.isPending}
                          />
                        </FormControl>
                      </FormItemLayout>
                    )}
                  />
                  <FormField
                    name="sendEmail"
                    control={form.control}
                    render={({ field }) => (
                      <FormItemLayout
                        label="Email a link to set the password"
                        layout="flex-row-reverse"
                      >
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                            disabled={add.isPending}
                          />
                        </FormControl>
                      </FormItemLayout>
                    )}
                  />
                  <div className="flex justify-end">
                    <Button variant="primary" type="submit" loading={add.isPending}>
                      Add admin
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </PageSectionContent>
      </PageSection>

      <ConfirmationModal
        variant="destructive"
        visible={removing !== undefined}
        title="Remove Studio access"
        confirmLabel="Remove access"
        loading={remove.isPending}
        onCancel={() => setRemoving(undefined)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      >
        <p className="text-sm text-foreground-light">
          <span className="text-foreground">{removing?.email}</span> will no longer be able to sign
          in to Studio. The Auth user itself is kept. Their current session lasts until it expires.
        </p>
      </ConfirmationModal>
    </>
  )
}
