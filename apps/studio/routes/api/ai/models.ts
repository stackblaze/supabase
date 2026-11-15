import { createFileRoute } from '@tanstack/react-router'
import { NextApiRequest, NextApiResponse } from 'next'

import { toWebHandler } from '@/compat/next/api'
import { listProxyModels, pickProxyModel, stackblazeAiConfig } from '@/lib/ai/stackblaze-proxy'
import { apiWrapper } from '@/lib/api/apiWrapper'

const wrapper = (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler, { withAuth: true })

// GET: the AI models the Assistant can use, when the StackBlaze platform's AI proxy provides
// them (self-hosted on StackBlaze). { provider: null } otherwise: Studio's own model list applies.
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }
  const config = stackblazeAiConfig()
  if (!config) return res.status(200).json({ provider: null, models: [] })
  try {
    const models = await listProxyModels(config)
    return res.status(200).json({
      provider: 'stackblaze',
      models,
      defaultModel: pickProxyModel(models, 'default') ?? null,
    })
  } catch (error) {
    return res
      .status(502)
      .json({ error: { message: error instanceof Error ? error.message : 'AI proxy unavailable' } })
  }
}

const webHandler = toWebHandler(wrapper)

export const Route = createFileRoute('/api/ai/models')({
  server: { handlers: { GET: webHandler } },
})
