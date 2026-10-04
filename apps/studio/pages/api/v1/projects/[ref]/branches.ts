import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { createBranch, getBranchingState } from '@/lib/api/self-hosted/platform-branches'

// Self-hosted stand-in for the platform's branch API, backed by the hosting platform.
// GET: the project's branches. POST { branch_name }: create one.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

const fail = (res: NextApiResponse, error: { status: number; message: string }) =>
  res.status(error.status >= 500 ? 502 : error.status).json({ message: error.message })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const state = await getBranchingState()
    if (state.error) return fail(res, state.error)
    return res.status(200).json(state.data.branches)
  }

  if (req.method === 'POST') {
    const name = typeof req.body?.branch_name === 'string' ? req.body.branch_name.trim() : ''
    if (!name) return res.status(400).json({ message: 'branch_name is required' })
    const created = await createBranch(name)
    if (created.error) return fail(res, created.error)
    return res.status(201).json(created.data)
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
}
