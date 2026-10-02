import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { authProviderConfigured, sendRecoveryEmail } from '@/lib/api/self-hosted/auth-provider'
import { selfHostedLoginEnabled } from '@/lib/api/self-hosted/session'
import { isEmail, publicUrl } from '@/lib/api/self-hosted/sign-in-helpers'

// Emails a password-reset link for an Auth user. Always 200 for a well-formed
// email, so the response does not reveal whether an account exists; Auth's
// own failures to send (no SMTP) are surfaced because the admin needs them.
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
  const { email } = (req.body ?? {}) as { email?: unknown }
  if (!isEmail(email)) return res.status(400).json({ error: { message: 'Enter a valid email' } })

  const result = await sendRecoveryEmail(email.trim(), `${publicUrl(req)}/reset-password`)
  if (result.error && result.error.status >= 500) {
    return res
      .status(502)
      .json({ error: { message: `Could not send the email: ${result.error.message}` } })
  }
  return res.status(200).json({ ok: true })
}
