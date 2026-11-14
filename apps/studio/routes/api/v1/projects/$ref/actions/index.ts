import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'

// Self-hosted: the hosting platform keeps no list of past runs; a merge is followed by its id.
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  return res.status(200).json([])
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/v1/projects/$ref/actions/')({
  server: { handlers: { GET: webHandler } },
})
