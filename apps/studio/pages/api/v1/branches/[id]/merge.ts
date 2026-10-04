import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { mergeBranch } from '@/lib/api/self-hosted/platform-branches'

// Self-hosted stand-in for the platform's branch merge: the hosting platform applies the
// branch's migrations and functions to the main deployment. Answers with the run to follow.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` })
  }
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) return res.status(400).json({ message: 'Branch id is required' })

  const merged = await mergeBranch(id)
  if (merged.error) {
    return res
      .status(merged.error.status >= 500 ? 502 : merged.error.status)
      .json({ message: merged.error.message })
  }
  return res.status(201).json(merged.data)
}
