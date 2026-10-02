import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  authProviderConfigured,
  isStudioAdmin,
  signInWithPassword,
  userFromAccessToken,
} from '@/lib/api/self-hosted/auth-provider'
import {
  clearSessionCookie,
  createSessionToken,
  credentialsMatch,
  selfHostedLoginEnabled,
  sessionCookie,
  type SessionIdentity,
} from '@/lib/api/self-hosted/session'
import { isSecureRequest } from '@/lib/api/self-hosted/sign-in-helpers'

// Self-hosted sign-in. GET tells the sign-in page which methods apply, POST
// signs in with { email, password } (an Auth user flagged as Studio admin),
// { accessToken } (the same, arriving through an email link) or
// { username, password } (the gateway's dashboard credential). DELETE signs out.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET': {
      const enabled = selfHostedLoginEnabled()
      return res.status(200).json({
        enabled,
        methods: { dashboard: enabled, email: enabled && authProviderConfigured() },
      })
    }
    case 'POST':
      return handlePost(req, res)
    case 'DELETE':
      res.setHeader('Set-Cookie', clearSessionCookie(isSecureRequest(req)))
      return res.status(200).json({ ok: true })
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!selfHostedLoginEnabled()) {
    return res.status(404).json({ error: { message: 'Sign-in is not enabled' } })
  }
  const body = (req.body ?? {}) as Record<string, unknown>

  let identity: SessionIdentity | undefined
  if (typeof body.accessToken === 'string') {
    identity = await identityFromToken(body.accessToken, res)
  } else if (typeof body.email === 'string' && typeof body.password === 'string') {
    identity = await identityFromPassword(body.email, body.password, res)
  } else if (typeof body.username === 'string' && typeof body.password === 'string') {
    if (!credentialsMatch(body.username, body.password)) {
      return res.status(401).json({ error: { message: 'Invalid username or password' } })
    }
    identity = { kind: 'dashboard' }
  } else {
    return res.status(400).json({ error: { message: 'Missing credentials' } })
  }
  if (!identity) return

  res.setHeader(
    'Set-Cookie',
    sessionCookie(await createSessionToken(identity), isSecureRequest(req))
  )
  return res.status(200).json({ ok: true, kind: identity.kind })
}

async function identityFromPassword(
  email: string,
  password: string,
  res: NextApiResponse
): Promise<SessionIdentity | undefined> {
  if (!authProviderConfigured()) {
    res.status(404).json({ error: { message: 'Email sign-in is not available' } })
    return undefined
  }
  const result = await signInWithPassword(email.trim(), password)
  if (result.error) {
    if (result.error.status >= 500) {
      res.status(502).json({ error: { message: `Auth error: ${result.error.message}` } })
    } else {
      res.status(401).json({ error: { message: 'Invalid email or password' } })
    }
    return undefined
  }
  return identityForUser(result.data.user, res)
}

async function identityFromToken(
  accessToken: string,
  res: NextApiResponse
): Promise<SessionIdentity | undefined> {
  if (!authProviderConfigured()) {
    res.status(404).json({ error: { message: 'Email sign-in is not available' } })
    return undefined
  }
  const result = await userFromAccessToken(accessToken)
  if (result.error) {
    res.status(401).json({ error: { message: 'This link is invalid or has expired' } })
    return undefined
  }
  return identityForUser(result.data, res)
}

function identityForUser(
  user: { id: string; email?: string; app_metadata?: Record<string, unknown> },
  res: NextApiResponse
): SessionIdentity | undefined {
  if (!isStudioAdmin(user)) {
    res.status(403).json({ error: { message: 'This account has no Studio access' } })
    return undefined
  }
  return { kind: 'user', sub: user.id, email: user.email ?? '' }
}
