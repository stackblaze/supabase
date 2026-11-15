import { z } from 'zod'

import { useProjectAiSettingsQuery } from '@/data/ai/project-ai-settings-query'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { IS_PLATFORM, OPT_IN_TAGS } from '@/lib/constants'

export const aiOptInLevelSchema = z.enum([
  'disabled',
  'schema',
  'schema_and_log',
  'schema_and_log_and_data',
])

export type AiOptInLevel = z.infer<typeof aiOptInLevelSchema>

export const getAiOptInLevel = (tags: string[] | undefined): AiOptInLevel => {
  const hasSql = tags?.includes(OPT_IN_TAGS.AI_SQL)
  const hasData = tags?.includes(OPT_IN_TAGS.AI_DATA)
  const hasLog = tags?.includes(OPT_IN_TAGS.AI_LOG)

  if (hasData) {
    return 'schema_and_log_and_data'
  } else if (hasLog) {
    return 'schema_and_log'
  } else if (hasSql) {
    return 'schema'
  } else {
    return 'disabled'
  }
}

/**
 * Determines if the organization has opted into *any* level of AI features (schema or schema_and_log or schema_and_log_and_data).
 * This is primarily for backward compatibility.
 * @returns boolean (true if opted into schema or schema_and_log or schema_and_log_and_data, false otherwise)
 */
export function useOrgOptedIntoAi(): boolean {
  const { aiOptInLevel } = useOrgAiOptInLevel()
  return aiOptInLevel !== 'disabled'
}

/**
 * Determines the organization's specific AI opt-in level and whether schema metadata should be included.
 * @returns Object with aiOptInLevel and includeSchemaMetadata
 */
export function useOrgAiOptInLevel(): {
  aiOptInLevel: AiOptInLevel
  includeSchemaMetadata: boolean
} {
  const { data: selectedOrganization } = useSelectedOrganizationQuery()
  // Self-hosted: the project's own AI data setting (Project Settings → AI); `schema` until known.
  const { data: projectAiSettings } = useProjectAiSettingsQuery()

  // [Joshen] Default to disabled until migration to clean up existing opt in tags are completed
  // Once toggled on, then we can default to their set opt in level and clean up feature flag
  const optInTags = selectedOrganization?.opt_in_tags
  const level = getAiOptInLevel(optInTags)
  const isOptedIntoAI = level !== 'disabled'

  // Self-hosted reads the project's setting, defaulting to 'schema' like upstream did
  const aiOptInLevel: AiOptInLevel = !IS_PLATFORM
    ? (projectAiSettings?.aiOptInLevel ?? 'schema')
    : isOptedIntoAI
      ? level
      : 'disabled'
  const includeSchemaMetadata = aiOptInLevel !== 'disabled'

  return { aiOptInLevel, includeSchemaMetadata }
}
