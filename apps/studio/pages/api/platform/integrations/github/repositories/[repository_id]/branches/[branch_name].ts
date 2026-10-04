import { NextApiRequest, NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { branchExists } from '@/lib/api/self-hosted/platform-github'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

// Whether a Git branch exists in a repository the GitHub App can access.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const result = await branchExists(
    Number(one(req.query.repository_id)),
    one(req.query.branch_name) ?? ''
  )
  if (result.error) {
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ message: result.error.message })
  }
  return res.status(200).json(result.data)
}
