import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { readSessionToken, SESSION_COOKIE } from '@/lib/api/self-hosted/session'

// Who the current self-hosted session belongs to (for the account menu).
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  const identity = await readSessionToken(req.cookies[SESSION_COOKIE])
  if (!identity) return res.status(401).json({ error: { message: 'Not signed in' } })
  return res
    .status(200)
    .json(
      identity.kind === 'user' ? { kind: 'user', email: identity.email } : { kind: 'dashboard' }
    )
}
