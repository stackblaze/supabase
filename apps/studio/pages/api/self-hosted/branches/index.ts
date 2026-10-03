import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import {
  createBranch,
  listBranches,
  platformBranchesConfigured,
} from '@/lib/api/self-hosted/platform-branches'

// GET: this deployment's branches (and whether the platform offers them at all).
// POST { name }: create a branch.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    if (!platformBranchesConfigured()) return res.status(200).json({ enabled: false })
    const result = await listBranches()
    // A token minted before branches existed is refused: treat it as "not offered".
    if (result.error && [401, 403].includes(result.error.status)) {
      return res.status(200).json({ enabled: false })
    }
    if (result.error) {
      return res.status(502).json({ error: { message: result.error.message } })
    }
    return res.status(200).json({ enabled: true, ...result.data })
  }

  if (req.method === 'POST') {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) return res.status(400).json({ error: { message: 'name is required' } })
    const result = await createBranch(name)
    if (result.error) {
      return res
        .status(result.error.status >= 500 ? 502 : result.error.status)
        .json({ error: { message: result.error.message } })
    }
    return res.status(200).json(result.data)
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res
    .status(405)
    .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
}
