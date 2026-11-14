import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  backupNow,
  listBackups,
  platformBackupsConfigured,
  platformBackupsInfo,
} from '@/lib/api/self-hosted/platform-backups'

// GET: the platform's backups of this database (+ running jobs). POST: take one now.
// Behind the self-hosted session gate like every /api route.
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    if (!platformBackupsConfigured()) return res.status(200).json({ enabled: false })
    const result = await listBackups()
    if (result.error)
      return res
        .status(result.error.status >= 500 ? 502 : result.error.status)
        .json({ error: { message: result.error.message } })
    return res.status(200).json({ enabled: true, ...platformBackupsInfo(), ...result.data })
  }
  if (req.method === 'POST') {
    const result = await backupNow()
    if (result.error)
      return res
        .status(result.error.status >= 500 ? 502 : result.error.status)
        .json({ error: { message: result.error.message } })
    return res.status(202).json(result.data)
  }
  res.setHeader('Allow', ['GET', 'POST'])
  return res
    .status(405)
    .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/self-hosted/backups/')({
  server: { handlers: { GET: webHandler, POST: webHandler } },
})
