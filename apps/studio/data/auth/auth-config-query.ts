import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { authKeys } from './keys'
import type { components } from '@/data/api'
import { get, handleError } from '@/data/fetchers'
import { useProjectDetailQuery } from '@/data/projects/project-detail-query'
import { IS_PLATFORM } from '@/lib/constants'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

export type AuthConfigVariables = {
  projectRef?: string
}

export type AuthConfigResponse = components['schemas']['GoTrueConfigResponse']

export async function getProjectAuthConfig(
  { projectRef }: AuthConfigVariables,
  signal?: AbortSignal
) {
  if (!projectRef) throw new Error('projectRef is required')

  const { data, error } = await get('/platform/auth/{ref}/config', {
    params: { path: { ref: projectRef } },
    signal,
  })

  if (error) handleError(error)
  return data
}

export type ProjectAuthConfigData = Awaited<ReturnType<typeof getProjectAuthConfig>>
export type ProjectAuthConfigError = ResponseError

export const useAuthConfigQuery = <TData = ProjectAuthConfigData>(
  { projectRef }: AuthConfigVariables,
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<ProjectAuthConfigData, ProjectAuthConfigError, TData> = {}
) => {
  // Self-hosted: only a hosting platform that keeps the auth service's settings can answer.
  const { data: project } = useProjectDetailQuery({ ref: projectRef }, { enabled: !IS_PLATFORM })
  const platformManaged = project?.is_platform_managed === true
  return useQuery<ProjectAuthConfigData, ProjectAuthConfigError, TData>({
    queryKey: authKeys.authConfig(projectRef),
    queryFn: ({ signal }) => getProjectAuthConfig({ projectRef }, signal),
    enabled:
      enabled &&
      (IS_PLATFORM || platformManaged) &&
      typeof projectRef !== 'undefined' &&
      projectRef !== '_',
    ...options,
  })
}

export const useAuthConfigPrefetch = ({ projectRef }: AuthConfigVariables) => {
  const client = useQueryClient()

  return useCallback(() => {
    if (projectRef) {
      client.prefetchQuery({
        queryKey: authKeys.authConfig(projectRef),
        queryFn: ({ signal }) => getProjectAuthConfig({ projectRef }, signal),
      })
    }
  }, [client, projectRef])
}
