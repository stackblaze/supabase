import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useOrgAiOptInLevel, useOrgOptedIntoAi } from './useOrgOptedIntoAi'
import { CustomWrapper } from '@/tests/lib/custom-render'

vi.mock('@/hooks/misc/useSelectedOrganization', () => ({
  useSelectedOrganizationQuery: () => ({ data: undefined }),
}))

const serve = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).endsWith('/api/self-hosted/ai-settings')) {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{}', { status: 404 })
  })

const render = () =>
  renderHook(() => ({ level: useOrgAiOptInLevel(), optedIn: useOrgOptedIntoAi() }), {
    wrapper: CustomWrapper,
  })

describe('self-hosted AI opt-in level', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is schema until the project setting is known', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
    const { result } = render()
    expect(result.current.level.aiOptInLevel).toBe('schema')
    expect(result.current.optedIn).toBe(true)
  })

  it('follows the project setting', async () => {
    serve({ aiOptInLevel: 'schema_and_log_and_data' })
    const { result } = render()
    await waitFor(() => expect(result.current.level.aiOptInLevel).toBe('schema_and_log_and_data'))
    expect(result.current.level.includeSchemaMetadata).toBe(true)
  })

  it('treats disabled as opted out, with no schema metadata', async () => {
    serve({ aiOptInLevel: 'disabled' })
    const { result } = render()
    await waitFor(() => expect(result.current.level.aiOptInLevel).toBe('disabled'))
    expect(result.current.optedIn).toBe(false)
    expect(result.current.level.includeSchemaMetadata).toBe(false)
  })
})
