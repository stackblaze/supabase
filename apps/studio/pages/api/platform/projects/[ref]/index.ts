import { NextApiRequest, NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getBranchingState, MAIN_REF } from '@/lib/api/self-hosted/platform-branches'
import { deletePlatformProject, getPlatformProject } from '@/lib/api/self-hosted/platform-project'
import { DEFAULT_PROJECT, PROJECT_REST_URL } from '@/lib/constants/api'

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'GET':
      return handleGet(req, res)
    case 'DELETE':
      return handleDelete(req, res)
    default:
      res.setHeader('Allow', ['GET', 'DELETE'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

const handleGet = async (_req: NextApiRequest, res: NextApiResponse) => {
  // Branching is offered by the hosting platform, per deployment. When this Studio is
  // itself a branch, its parent is the main deployment.
  const branching = (await getBranchingState()).data
  const response = {
    ...DEFAULT_PROJECT,
    connectionString: '',
    restUrl: PROJECT_REST_URL,
    is_branch_enabled: branching?.enabled === true,
    // The hosting platform manages this deployment: restart, versions, sizes.
    is_platform_managed: (await getPlatformProject()) !== null,
    ...(branching?.isBranch ? { parent_project_ref: MAIN_REF } : {}),
  }

  return res.status(200).json(response)
}

// The hosting platform deletes the whole deployment: services, database and storage.
const handleDelete = async (_req: NextApiRequest, res: NextApiResponse) => {
  const branching = (await getBranchingState()).data
  if (branching?.isBranch) {
    return res.status(400).json({ message: 'A branch is deleted from the Branches page' })
  }
  const deleted = await deletePlatformProject()
  if (deleted.error) {
    return res
      .status(deleted.error.status >= 500 ? 502 : deleted.error.status)
      .json({ message: deleted.error.message })
  }
  return res.status(200).json({ ...DEFAULT_PROJECT })
}
