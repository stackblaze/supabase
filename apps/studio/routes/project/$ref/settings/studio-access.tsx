import { createFileRoute } from '@tanstack/react-router'

import StudioAccessPage from '@/pages/project/[ref]/settings/studio-access'

export const Route = createFileRoute('/project/$ref/settings/studio-access')({
  component: SettingsStudioAccessRoute,
  staticData: { settingsLayoutTitle: 'Studio access' },
})

function SettingsStudioAccessRoute() {
  return <StudioAccessPage dehydratedState={undefined} />
}
