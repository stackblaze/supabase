import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  deletePlatformSecrets,
  getPlatformSecrets,
  setPlatformSecrets,
} from '@/lib/api/self-hosted/platform-project'

// Self-hosted stand-in for the platform's function secrets: the hosting platform keeps them
// on the functions service and restarts it when they change. Values are never read back.
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const result =
    req.method === 'GET'
      ? await getPlatformSecrets()
      : req.method === 'POST'
        ? await setPlatformSecrets(Array.isArray(req.body) ? req.body : [])
        : req.method === 'DELETE'
          ? await deletePlatformSecrets(Array.isArray(req.body) ? req.body : [])
          : undefined
  if (!result) {
    res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  if (result.error) {
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ message: result.error.message })
  }
  if (req.method === 'GET') return res.status(200).json(result.data)
  return res.status(req.method === 'POST' ? 201 : 200).json({ message: 'ok' })
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/v1/projects/$ref/secrets')({
  server: { handlers: { GET: webHandler, POST: webHandler, DELETE: webHandler } },
})
