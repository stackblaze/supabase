import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { deleteBackup } from '@/lib/api/self-hosted/platform-backups'

// DELETE ?key=…: remove one backup from the platform's bucket.
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', ['DELETE'])
    return res
      .status(405)
      .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
  }
  const key = Array.isArray(req.query.key) ? req.query.key[0] : req.query.key
  if (!key) return res.status(400).json({ error: { message: 'key is required' } })
  const result = await deleteBackup(key)
  if (result.error)
    return res
      .status(result.error.status >= 500 ? 502 : result.error.status)
      .json({ error: { message: result.error.message } })
  return res.status(200).json(result.data)
}
