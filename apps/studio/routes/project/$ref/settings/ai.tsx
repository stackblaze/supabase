import { createFileRoute } from '@tanstack/react-router'

import { ProjectAiSettings } from '@/components/interfaces/Settings/AI/ProjectAiSettings'

export const Route = createFileRoute('/project/$ref/settings/ai')({
  component: ProjectAiSettings,
  staticData: { settingsLayoutTitle: 'AI' },
})
