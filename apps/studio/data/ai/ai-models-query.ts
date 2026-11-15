import { useQuery } from '@tanstack/react-query'

import { aiKeys } from './keys'
import { classifyResponseError } from '@/data/error-classification'
import { constructHeaders, fetchHandler } from '@/data/fetchers'
import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'
import { UseCustomQueryOptions } from '@/types'

/**
 * Self-hosted on the StackBlaze platform, the AI models come from the platform's AI proxy
 * (read at runtime). `provider: null` means Studio's own model list applies.
 */
export type AiModelsData = {
  provider: 'stackblaze' | null
  models: string[]
  defaultModel?: string | null
}

export async function getAiModels(signal?: AbortSignal): Promise<AiModelsData> {
  if (IS_PLATFORM) return { provider: null, models: [] }

  const headers = await constructHeaders()
  const response = await fetchHandler(`${BASE_PATH}/api/ai/models`, { headers, signal })
  let body: any
  try {
    body = await response.json()
  } catch {}

  if (!response.ok) {
    throw classifyResponseError({ message: body?.error?.message, code: response.status })
  }
  return body as AiModelsData
}

export type AiModelsError = { errorEventId: string; message: string }

export const useAiModelsQuery = <TData = AiModelsData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<AiModelsData, AiModelsError, TData> = {}) =>
  useQuery<AiModelsData, AiModelsError, TData>({
    queryKey: aiKeys.models(),
    queryFn: ({ signal }) => getAiModels(signal),
    enabled: enabled && !IS_PLATFORM,
    staleTime: 5 * 60 * 1000,
    ...options,
  })
