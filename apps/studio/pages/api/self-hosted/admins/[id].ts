import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { authProviderConfigured, setStudioAdmin } from '@/lib/api/self-hosted/auth-provider'
import { selfHostedLoginEnabled } from '@/lib/api/self-hosted/session'

// DELETE removes Studio access from an Auth user (the user itself stays).
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  if (!selfHostedLoginEnabled() || !authProviderConfigured()) {
    return res.status(404).json({ error: { message: 'Email sign-in is not available' } })
  }
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) return res.status(400).json({ error: { message: 'Missing user id' } })

  const result = await setStudioAdmin(id, false)
  if (result.error) {
    return res
      .status(result.error.status >= 500 ? 502 : 400)
      .json({ error: { message: result.error.message } })
  }
  return res.status(200).json({ ok: true })
}
