import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { restoreBackupAsNew } from '@/lib/api/self-hosted/platform-backups'

// POST { key }: restore one backup into a NEW database next to this one
// (platform restore-copy). Answers { ok, job, from, to, displayName }.
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  // Restores into a NEW database, so nothing is overwritten and no typed confirmation is needed.
  const { key } = (req.body ?? {}) as { key?: unknown }
  if (typeof key !== 'string' || !key)
    return res.status(400).json({ error: { message: 'key is required' } })
  const result = await restoreBackupAsNew(key)
  if (result.error)
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ error: { message: result.error.message } })
  return res.status(202).json(result.data)
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/self-hosted/backups/restore')({
  server: { handlers: { POST: webHandler } },
})
