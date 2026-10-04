import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getMergeRun } from '@/lib/api/self-hosted/platform-branches'

// Self-hosted stand-in for a platform action run: a merge started on the hosting platform.
// The native screens derive the state from the steps: none yet = running, EXITED = done,
// DEAD = failed.
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
  const { id, state, createdAt, finishedAt } = run.data
  const created = createdAt ?? new Date().toISOString()
  const updated = finishedAt ?? created
  return res.status(200).json({
    id,
    branch_id: '',
    check_run_id: null,
    git_config: null,
    workdir: null,
    created_at: created,
    updated_at: updated,
    run_steps:
      state === 'running'
        ? []
        : [
            {
              name: 'migrate',
              status: state === 'passed' ? 'EXITED' : 'DEAD',
              created_at: created,
              updated_at: updated,
            },
          ],
  })
}
