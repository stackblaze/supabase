import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { deleteBranch } from '@/lib/api/self-hosted/platform-branches'

// DELETE: remove one branch, its apps, database and storage.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  const name = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name
  if (!name) return res.status(400).json({ error: { message: 'name is required' } })
  const result = await deleteBranch(name)
  if (result.error) {
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ error: { message: result.error.message } })
  }
  return res.status(200).json(result.data)
}
