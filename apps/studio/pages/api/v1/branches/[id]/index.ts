import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { deleteBranch, findBranch, updateBranch } from '@/lib/api/self-hosted/platform-branches'

// Self-hosted stand-in for the platform's branch API. GET: one branch. PATCH: link the main
// branch to a Git branch. DELETE: remove a branch, with its database and storage.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

const fail = (res: NextApiResponse, error: { status: number; message: string }) =>
  res.status(error.status >= 500 ? 502 : error.status).json({ message: error.message })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) return res.status(400).json({ message: 'Branch id is required' })

  if (req.method === 'GET') {
    const found = await findBranch(id)
    if (found.error) return fail(res, found.error)
    return res.status(200).json(found.data)
  }

  if (req.method === 'PATCH') {
    const gitBranch = req.body?.git_branch
    const updated = await updateBranch(id, {
      gitBranch: typeof gitBranch === 'string' ? gitBranch : undefined,
      requestReview:
        typeof req.body?.request_review === 'boolean' ? req.body.request_review : undefined,
    })
    if (updated.error) return fail(res, updated.error)
    return res.status(200).json(updated.data)
  }

  if (req.method === 'DELETE') {
    const removed = await deleteBranch(id)
    if (removed.error) return fail(res, removed.error)
    return res.status(200).json(removed.data)
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE'])
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
}
