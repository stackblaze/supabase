import * as Sentry from '@sentry/nextjs'
import { createFileRoute } from '@tanstack/react-router'
import type { components } from 'api-types'

import { getFunctionsArtifactStore } from '@/lib/api/self-hosted/functions'
import { uuidv4 } from '@/lib/helpers'

// The deploy mutation posts multipart form data: a `metadata` JSON part plus
// one `file` part per source file, named by its path inside the function.
//
// A native Web handler rather than `toWebHandler`: the Next adapter buffers
// non-JSON bodies as text, which would corrupt binary files. The Web
// `Request` parses multipart itself. `getFunctionsArtifactStore` asserts
// self-hosted mode, so no auth wrapper is needed (same as `$slug/body.ts`).

type EdgeFunctionsResponse = components['schemas']['FunctionResponse_Output']

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const POST = async ({ request }: { request: Request }) => {
  try {
    const slug = new URL(request.url).searchParams.get('slug')
    if (!slug) return json({ error: { message: `Missing function 'slug' parameter` } }, 400)

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.startsWith('multipart/form-data')) {
      return json({ error: { message: 'Expected multipart/form-data' } }, 400)
    }

    const formData = await request.formData()
    const files = await Promise.all(
      formData
        .getAll('file')
        .filter((part): part is File => part instanceof File)
        .map(async (file) => ({
          relativePath: file.name,
          content: Buffer.from(await file.arrayBuffer()),
        }))
    )
    if (files.length === 0) return json({ error: { message: 'No files to deploy' } }, 400)

    const store = getFunctionsArtifactStore()
    let written: boolean
    try {
      written = await store.writeFunction(slug, files)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid file'
      return json({ error: { message } }, 400)
    }
    if (!written) return json({ error: { message: `Invalid function slug` } }, 400)

    const functionsArtifact = await store.getFunctionBySlug(slug)
    if (!functionsArtifact) {
      return json({ error: { message: 'The function needs an index entrypoint at its root' } }, 400)
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

    return json(functionResponse, 201)
  } catch (error) {
    // Mirrors `apiWrapper`'s global catch without echoing internals to the client.
    Sentry.captureException(error)
    return json({ error: { message: 'Internal Server Error' } }, 500)
  }
}

export const Route = createFileRoute('/api/v1/projects/$ref/functions/deploy')({
  server: { handlers: { POST } },
})
