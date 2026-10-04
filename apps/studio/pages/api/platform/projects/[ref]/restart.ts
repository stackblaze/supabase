import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { restartPlatformProject } from '@/lib/api/self-hosted/platform-project'

// Self-hosted stand-in for the platform's project restart: the hosting platform restarts
// the deployment's services. The database is shared and keeps running.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const restarted = await restartPlatformProject()
  if (restarted.error) {
    return res
      .status(restarted.error.status >= 500 ? 502 : restarted.error.status)
      .json({ message: restarted.error.message })
  }
  if (restarted.data.failed.length > 0) {
    return res
      .status(502)
      .json({ message: `Could not restart: ${restarted.data.failed.join(', ')}` })
  }
  return res.status(201).json({})
}
