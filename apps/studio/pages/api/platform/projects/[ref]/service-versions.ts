import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getPlatformProject, serviceVersions } from '@/lib/api/self-hosted/platform-project'
import { executeQuery } from '@/lib/api/self-hosted/query'

// Self-hosted stand-in for the platform's service versions: the images the hosting platform
// runs for this deployment, and the version of the Postgres server it is connected to.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const project = await getPlatformProject()
  if (!project) return res.status(404).json({ message: 'Not managed by a hosting platform' })

  const postgres = await executeQuery<{ version: string }>({
    query: "select current_setting('server_version') as version",
    readOnly: true,
  })
  return res.status(200).json({
    ...serviceVersions(project),
    'supabase-postgres': postgres.data?.[0]?.version ?? '',
  })
}
