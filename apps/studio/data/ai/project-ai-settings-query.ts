import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { aiKeys } from './keys'
import { classifyResponseError } from '@/data/error-classification'
import { constructHeaders, fetchHandler } from '@/data/fetchers'
import type { AiOptInLevel } from '@/hooks/misc/useOrgOptedIntoAi'
import { BASE_PATH, IS_PLATFORM } from '@/lib/constants'
import type { UseCustomQueryOptions } from '@/types'

/** Self-hosted: this project's AI data setting (Project Settings → AI). */
export type ProjectAiSettings = { aiOptInLevel: AiOptInLevel }

const URL = `${BASE_PATH}/api/self-hosted/ai-settings`

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

export async function getProjectAiSettings(signal?: AbortSignal): Promise<ProjectAiSettings> {
  const headers = await constructHeaders()
  const response = await fetchHandler(URL, { headers, signal })
  const body = await readJson(response)
  if (!response.ok) {
    throw classifyResponseError({ message: body?.error?.message, code: response.status })
  }
  return body as ProjectAiSettings
}

export type ProjectAiSettingsError = { errorEventId: string; message: string }

export const useProjectAiSettingsQuery = <TData = ProjectAiSettings>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<ProjectAiSettings, ProjectAiSettingsError, TData> = {}) =>
  useQuery<ProjectAiSettings, ProjectAiSettingsError, TData>({
    queryKey: aiKeys.projectSettings(),
    queryFn: ({ signal }) => getProjectAiSettings(signal),
    enabled: enabled && !IS_PLATFORM,
    staleTime: 30 * 1000,
    ...options,
  })

export async function updateProjectAiSettings(
  settings: ProjectAiSettings
): Promise<ProjectAiSettings> {
  const headers = await constructHeaders({ 'Content-Type': 'application/json' })
  const response = await fetchHandler(URL, {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings),
  })
  const body = await readJson(response)
  if (!response.ok) {
    throw new Error(body?.error?.message ?? 'Could not save the AI setting')
  }
  return body as ProjectAiSettings
}

export const useProjectAiSettingsMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProjectAiSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(aiKeys.projectSettings(), data)
    },
  })
}
