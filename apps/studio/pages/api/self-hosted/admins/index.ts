import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  authProviderConfigured,
  createStudioAdmin,
  findUserByEmail,
  listStudioAdmins,
  sendRecoveryEmail,
  setStudioAdmin,
  type AuthUser,
} from '@/lib/api/self-hosted/auth-provider'
import { selfHostedLoginEnabled } from '@/lib/api/self-hosted/session'
import { isEmail, MIN_PASSWORD_LENGTH, publicUrl } from '@/lib/api/self-hosted/sign-in-helpers'

// Who may sign in to this Studio. The request proxy already requires a
// session for every /api route, so anyone here is signed in. GET lists the
// flagged Auth users; POST { email, password?, sendEmail? } flags an existing
// user or creates one, and emails a set-password link when asked (or when no
// password was given).
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

const toAdmin = (user: AuthUser) => ({
  id: user.id,
  email: user.email ?? '',
  created_at: user.created_at ?? null,
  last_sign_in_at: user.last_sign_in_at ?? null,
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!selfHostedLoginEnabled() || !authProviderConfigured()) {
    return res.status(404).json({ error: { message: 'Email sign-in is not available' } })
  }
  switch (req.method) {
    case 'GET': {
      const admins = await listStudioAdmins()
      if (admins.error) return res.status(502).json({ error: { message: admins.error.message } })
      return res.status(200).json({ admins: admins.data.map(toAdmin) })
    }
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST'])
      return res
        .status(405)
        .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const body = (req.body ?? {}) as { email?: unknown; password?: unknown; sendEmail?: unknown }
  if (!isEmail(body.email))
    return res.status(400).json({ error: { message: 'Enter a valid email' } })
  const email = body.email.trim()
  const password = typeof body.password === 'string' && body.password ? body.password : undefined
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: { message: `The password needs at least ${MIN_PASSWORD_LENGTH} characters` },
    })
  }
  const sendEmail = body.sendEmail === true || password === undefined

  const existing = await findUserByEmail(email)
  if (existing.error) return res.status(502).json({ error: { message: existing.error.message } })

  const saved = existing.data
    ? await setStudioAdmin(existing.data.id, true, password)
    : await createStudioAdmin(email, password)
  if (saved.error) {
    return res
      .status(saved.error.status >= 500 ? 502 : 400)
      .json({ error: { message: saved.error.message } })
  }

  let emailSent = false
  let emailError: string | undefined
  if (sendEmail) {
    const sent = await sendRecoveryEmail(email, `${publicUrl(req)}/reset-password`)
    emailSent = !sent.error
    emailError = sent.error?.message
  }
  return res.status(existing.data ? 200 : 201).json({
    admin: toAdmin(saved.data),
    created: !existing.data,
    emailSent,
    ...(emailError ? { emailError } : {}),
  })
}
