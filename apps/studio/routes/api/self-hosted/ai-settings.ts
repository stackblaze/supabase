import { createFileRoute } from '@tanstack/react-router'
import { type NextApiRequest, type NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { optInLevelSchema } from '@/lib/ai/opt-in-level'
import { apiWrapper } from '@/lib/api/apiWrapper'
import { getProjectAiOptInLevel, setProjectAiOptInLevel } from '@/lib/api/self-hosted/ai-settings'
import { assertSelfHosted } from '@/lib/api/self-hosted/util'

// GET → { aiOptInLevel }, PUT { aiOptInLevel } → { aiOptInLevel }: this project's AI data
// setting (Project Settings → AI), stored in the project's own Postgres. Behind Studio's sign-in.
function nextHandler(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  assertSelfHosted()
  if (req.method === 'GET') {
    return res.status(200).json({ aiOptInLevel: await getProjectAiOptInLevel() })
  }
  if (req.method === 'PUT') {
    const parsed = optInLevelSchema.safeParse((req.body ?? {}).aiOptInLevel)
    if (!parsed.success) {
      return res.status(400).json({ error: { message: 'aiOptInLevel is not a known level' } })
    }
    try {
      return res.status(200).json({ aiOptInLevel: await setProjectAiOptInLevel(parsed.data) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save the AI setting'
      return res.status(500).json({ error: { message } })
    }
  }
  res.setHeader('Allow', ['GET', 'PUT'])
  return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
}

const webHandler = toWebHandler(nextHandler)

export const Route = createFileRoute('/api/self-hosted/ai-settings')({
  server: { handlers: { GET: webHandler, PUT: webHandler } },
})
