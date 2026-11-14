import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { platformBackupsInfo, restoreBackup } from '@/lib/api/self-hosted/platform-backups'

// POST { key, confirm }: restore one backup OVER the live database (platform
// restore-in-place). confirm must be the database instance name, as the
// platform requires too. Answers 202 { ok, job, jobNamespace, instance, key };
// the whole deployment, Studio included, is down while the job runs.
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
  const { key, confirm } = (req.body ?? {}) as { key?: unknown; confirm?: unknown }
  if (typeof key !== 'string' || !key)
    return res.status(400).json({ error: { message: 'key is required' } })
  if (confirm !== platformBackupsInfo().instance) {
    return res
      .status(400)
      .json({ error: { message: 'Type the database name to confirm the restore' } })
  }
  const result = await restoreBackup(key)
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
