import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  authProviderConfigured,
  isStudioAdmin,
  updatePassword,
  userFromAccessToken,
} from '@/lib/api/self-hosted/auth-provider'
import {
  createSessionToken,
  selfHostedLoginEnabled,
  sessionCookie,
} from '@/lib/api/self-hosted/session'
import { isSecureRequest, MIN_PASSWORD_LENGTH } from '@/lib/api/self-hosted/sign-in-helpers'

// Sets a new password with the access token from a recovery link, then signs
// the person in when they have Studio access.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  if (!selfHostedLoginEnabled() || !authProviderConfigured()) {
    return res.status(404).json({ error: { message: 'Email sign-in is not available' } })
  }
  const { accessToken, password } = (req.body ?? {}) as {
    accessToken?: unknown
    password?: unknown
  }
  if (typeof accessToken !== 'string' || !accessToken) {
    return res.status(400).json({ error: { message: 'This link is invalid or has expired' } })
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: { message: `The password needs at least ${MIN_PASSWORD_LENGTH} characters` },
    })
  }

  const user = await userFromAccessToken(accessToken)
  if (user.error) {
    return res.status(401).json({ error: { message: 'This link is invalid or has expired' } })
  }
  const updated = await updatePassword(accessToken, password)
  if (updated.error) {
    return res.status(400).json({ error: { message: updated.error.message } })
  }

  const signedIn = isStudioAdmin(updated.data)
  if (signedIn) {
    const token = await createSessionToken({
      kind: 'user',
      sub: updated.data.id,
      email: updated.data.email ?? '',
    })
    res.setHeader('Set-Cookie', sessionCookie(token, isSecureRequest(req)))
  }
  return res.status(200).json({ ok: true, signedIn })
}
