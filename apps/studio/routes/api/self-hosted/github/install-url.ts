import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { getInstallUrl } from '@/lib/api/self-hosted/platform-github'

// GET: where to install the hosting platform's GitHub App, to give it access to repositories.
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  const result = await getInstallUrl()
  if (result.error) {
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ error: { message: result.error.message } })
  }
  return res.status(200).json(result.data)
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/self-hosted/github/install-url')({
  server: { handlers: { GET: webHandler } },
})
