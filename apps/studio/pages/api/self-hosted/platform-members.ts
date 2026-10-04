import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getPlatformMembers } from '@/lib/api/self-hosted/platform-project'

// Who has access to this deployment on the hosting platform: the members of the workspace
// that owns it. Read-only; they are managed in the platform's dashboard.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const members = await getPlatformMembers()
  if (members.error) {
    return res
      .status(members.error.status >= 500 ? 502 : members.error.status)
      .json({ message: members.error.message })
  }
  return res.status(200).json(members.data)
}
