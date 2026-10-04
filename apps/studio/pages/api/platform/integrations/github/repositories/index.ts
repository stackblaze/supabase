import { NextApiRequest, NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { listRepositories } from '@/lib/api/self-hosted/platform-github'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

// Repositories the tenant's installations of the hosting platform's GitHub App can access.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  const repositories = await listRepositories()
  if (repositories.error) {
    return res.status(502).json({ message: repositories.error.message })
  }
  return res
    .status(200)
    .json({ partial_response_due_to_sso: false, repositories: repositories.data })
}
