import { type NextApiRequest, type NextApiResponse } from 'next'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getSchedule, setSchedule, type DumpCadence } from '@/lib/api/self-hosted/platform-backups'

// GET / PUT the environment's dump schedule (cadences + retention).
export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler)
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const result = await getSchedule()
    if (result.error)
      return res
        .status(result.error.status >= 500 ? 502 : result.error.status)
        .json({ error: { message: result.error.message } })
    return res.status(200).json(result.data)
  }
  if (req.method === 'PUT') {
    const body = (req.body ?? {}) as { cadences?: unknown; dbNames?: unknown }
    if (!Array.isArray(body.cadences))
      return res.status(400).json({ error: { message: 'cadences is required' } })
    const cadences: DumpCadence[] = []
    for (const c of body.cadences as Array<Record<string, unknown>>) {
      if (
        typeof c?.id !== 'string' ||
        typeof c?.enabled !== 'boolean' ||
        typeof c?.retentionHours !== 'number'
      ) {
        return res
          .status(400)
          .json({ error: { message: 'Each cadence needs id, enabled and retentionHours' } })
      }
      cadences.push({ id: c.id, enabled: c.enabled, retentionHours: c.retentionHours })
    }
    const dbNames = Array.isArray(body.dbNames)
      ? (body.dbNames as unknown[]).filter((n): n is string => typeof n === 'string')
      : null
    const result = await setSchedule({ cadences, dbNames })
    if (result.error)
      return res
        .status(result.error.status >= 500 ? 502 : result.error.status)
        .json({ error: { message: result.error.message } })
    return res.status(200).json(result.data)
  }
  res.setHeader('Allow', ['GET', 'PUT'])
  return res
    .status(405)
    .json({ data: null, error: { message: `Method ${req.method} Not Allowed` } })
}
