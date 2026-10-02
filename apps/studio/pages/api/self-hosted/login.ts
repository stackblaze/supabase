import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  clearSessionCookie,
  createSessionToken,
  credentialsMatch,
  selfHostedLoginEnabled,
  sessionCookie,
} from '@/lib/api/self-hosted/session'

// Self-hosted sign-in. GET tells the sign-in page whether it applies, POST
// signs in with { username, password }, DELETE signs out.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return res.status(200).json({ enabled: selfHostedLoginEnabled() })
    case 'POST':
      return handlePost(req, res)
    case 'DELETE':
      res.setHeader('Set-Cookie', clearSessionCookie(isSecure(req)))
      return res.status(200).json({ ok: true })
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const isSecure = (req: NextApiRequest) =>
  String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim() === 'https'

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!selfHostedLoginEnabled()) {
    return res.status(404).json({ error: { message: 'Sign-in is not enabled' } })
  }
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown }
  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !credentialsMatch(username, password)
  ) {
    return res.status(401).json({ error: { message: 'Invalid username or password' } })
  }
  res.setHeader('Set-Cookie', sessionCookie(await createSessionToken(), isSecure(req)))
  return res.status(200).json({ ok: true })
}
