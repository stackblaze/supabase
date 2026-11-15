import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { getPitr, restorePitr, setPitr } from '@/lib/api/self-hosted/platform-backups'

// Point-in-time recovery of this deployment's database (kubero-server #2407).
// GET: state + recoverable window. PUT { enabled, retentionDays }: the save.
// POST { targetTime }: restore the project to that time (202).
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

function fail(res: NextApiResponse, error: { status: number; message: string }) {
  return res
    .status(error.status >= 500 ? 502 : error.status)
    .json({ error: { message: error.message } })
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const result = await getPitr()
    if (result.error) return fail(res, result.error)
    return res.status(200).json(result.data)
  }
  if (req.method === 'PUT') {
    const { enabled, retentionDays } = (req.body ?? {}) as {
      enabled?: unknown
      retentionDays?: unknown
    }
    if (typeof enabled !== 'boolean')
      return res.status(400).json({ error: { message: 'enabled is required' } })
    if (retentionDays !== undefined && typeof retentionDays !== 'number')
      return res.status(400).json({ error: { message: 'retentionDays must be a number' } })
    const result = await setPitr({ enabled, ...(retentionDays ? { retentionDays } : {}) })
    if (result.error) return fail(res, result.error)
    return res.status(200).json(result.data)
  }
  if (req.method === 'POST') {
    const { targetTime } = (req.body ?? {}) as { targetTime?: unknown }
    if (typeof targetTime !== 'string' || Number.isNaN(Date.parse(targetTime)))
      return res.status(400).json({ error: { message: 'targetTime must be an ISO timestamp' } })
    const result = await restorePitr(new Date(targetTime).toISOString())
    if (result.error) return fail(res, result.error)
    return res.status(202).json(result.data)
  }
  res.setHeader('Allow', ['GET', 'PUT', 'POST'])
  return res
    .status(405)
    .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/self-hosted/backups/pitr')({
  server: { handlers: { GET: webHandler, PUT: webHandler, POST: webHandler } },
})
