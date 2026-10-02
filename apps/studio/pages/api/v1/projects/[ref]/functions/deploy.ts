import type { components } from 'api-types'
import { type NextApiRequest, type NextApiResponse } from 'next'
import { Readable } from 'node:stream'

import { apiWrapper } from '@/lib/api/apiWrapper'
import { getFunctionsArtifactStore } from '@/lib/api/self-hosted/functions'
import { uuidv4 } from '@/lib/helpers'

// The deploy mutation posts multipart form data: a `metadata` JSON part plus
// one `file` part per source file, named by its path inside the function.
export const config = { api: { bodyParser: false } }

export default function handlerWithErrorCatching(req: NextApiRequest, res: NextApiResponse) {
  return apiWrapper(req, res, handler, { withAuth: true })
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req

  switch (method) {
    case 'POST':
      return handlePost(req, res)
    default:
      res.setHeader('Allow', ['POST'])
      res.status(405).json({ data: null, error: { message: `Method ${method} Not Allowed` } })
  }
}

type EdgeFunctionsResponse = components['schemas']['FunctionResponse_Output']

const handlePost = async (req: NextApiRequest, res: NextApiResponse) => {
  const slugParam = req.query.slug
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam
  if (!slug)
    return res.status(400).json({ error: { message: `Missing function 'slug' parameter` } })

  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.startsWith('multipart/form-data')) {
    return res.status(400).json({ error: { message: 'Expected multipart/form-data' } })
  }

  // Node's fetch implementation already parses multipart bodies; wrapping the
  // incoming request in one avoids a parser dependency.
  const formData = await new Request('http://studio.local/deploy', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: Readable.toWeb(req) as unknown as ReadableStream,
    duplex: 'half',
  } as RequestInit).formData()

  const files = await Promise.all(
    formData
      .getAll('file')
      .filter((part): part is File => part instanceof File)
      .map(async (file) => ({
        relativePath: file.name,
        content: Buffer.from(await file.arrayBuffer()),
      }))
  )
  if (files.length === 0) return res.status(400).json({ error: { message: 'No files to deploy' } })

  const store = getFunctionsArtifactStore()
  let written: boolean
  try {
    written = await store.writeFunction(slug, files)
  } catch (error: any) {
    return res.status(400).json({ error: { message: error?.message ?? 'Invalid file' } })
  }
  if (!written) return res.status(400).json({ error: { message: `Invalid function slug` } })

  const functionsArtifact = await store.getFunctionBySlug(slug)
  if (!functionsArtifact) {
    return res
      .status(400)
      .json({ error: { message: 'The function needs an index entrypoint at its root' } })
  }

  const functionResponse = {
    id: uuidv4(),
    slug: functionsArtifact.slug,
    version: 1,
    name: functionsArtifact.slug,
    status: 'ACTIVE',
    entrypoint_path: functionsArtifact.entrypoint_path,
    created_at: functionsArtifact.created_at,
    updated_at: functionsArtifact.updated_at,
  } satisfies EdgeFunctionsResponse

  return res.status(201).json(functionResponse)
}
