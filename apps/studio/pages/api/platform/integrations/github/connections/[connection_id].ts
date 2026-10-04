import { NextApiRequest, NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { deleteConnection, saveConnection } from '@/lib/api/self-hosted/platform-github'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

const fail = (res: NextApiResponse, error: { status: number; message: string }) =>
  res.status(error.status >= 500 ? 502 : error.status).json({ message: error.message })

// PATCH: update the connection's settings. DELETE: disconnect the repository.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'PATCH': {
      const body = req.body ?? {}
      const saved = await saveConnection({
        workdir: typeof body.workdir === 'string' ? body.workdir : undefined,
        newBranchPerPr:
          typeof body.new_branch_per_pr === 'boolean' ? body.new_branch_per_pr : undefined,
        supabaseChangesOnly:
          typeof body.supabase_changes_only === 'boolean' ? body.supabase_changes_only : undefined,
        branchLimit: typeof body.branch_limit === 'number' ? body.branch_limit : undefined,
      })
      if (saved.error) return fail(res, saved.error)
      return res.status(200).json(saved.data)
    }
    case 'DELETE': {
      const removed = await deleteConnection()
      if (removed.error) return fail(res, removed.error)
      return res.status(200).json({})
    }
    default:
      res.setHeader('Allow', ['PATCH', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}
