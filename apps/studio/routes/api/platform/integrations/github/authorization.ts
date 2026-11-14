import { createFileRoute } from '@tanstack/react-router'
import { NextApiRequest, NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { isAuthorized } from '@/lib/api/self-hosted/platform-github'

const nextHandler = (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

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

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/platform/integrations/github/authorization')({
  server: { handlers: { GET: webHandler, POST: webHandler, DELETE: webHandler } },
})
