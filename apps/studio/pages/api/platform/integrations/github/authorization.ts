import { NextApiRequest, NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { isAuthorized } from '@/lib/api/self-hosted/platform-github'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

// Self-hosted: "authorized" means the tenant has installed the hosting platform's GitHub
// App. Installing happens on GitHub itself, so there is nothing to create or revoke here.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return res
        .status(200)
        .json((await isAuthorized()) ? { id: 1, sender_id: 1, user_id: 1 } : (null as any))
    case 'POST':
    case 'DELETE':
      return res.status(200).json({})
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}
