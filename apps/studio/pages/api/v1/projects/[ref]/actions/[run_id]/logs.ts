import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getMergeRun } from '@/lib/api/self-hosted/platform-branches'

// Self-hosted stand-in for a platform action run's logs: the output of the merge.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const runId = Array.isArray(req.query.run_id) ? req.query.run_id[0] : req.query.run_id
  if (!runId) return res.status(400).json({ message: 'Run id is required' })

  const run = await getMergeRun(runId)
  if (run.error) {
    return res
      .status(run.error.status >= 500 ? 502 : run.error.status)
      .json({ message: run.error.message })
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  return res.status(200).send(run.data.logs)
}
