import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getAuthConfig, updateAuthConfig } from '@/lib/api/self-hosted/platform-auth-config'

// Self-hosted stand-in for the platform's auth config: the hosting platform keeps the auth
// service's settings and restarts it when they change.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', ['GET', 'PATCH'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const result = req.method === 'GET' ? await getAuthConfig() : await updateAuthConfig(req.body)
  if (result.error) {
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ message: result.error.message })
  }
  return res.status(200).json(result.data)
}
