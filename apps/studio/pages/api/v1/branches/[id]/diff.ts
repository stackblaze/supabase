import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getBranchDiff } from '@/lib/api/self-hosted/platform-branches'

// Self-hosted stand-in for the platform's branch diff: the SQL that brings the main
// deployment's schema to this branch's, as plain text. The hosting platform compares the
// two databases.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) return res.status(400).json({ message: 'Branch id is required' })

  const diff = await getBranchDiff(id)
  if (diff.error) {
    const status = diff.error.status >= 500 && diff.error.status !== 503 ? 502 : diff.error.status
    return res.status(status).json({ message: diff.error.message })
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  return res.status(200).send(diff.data)
}
