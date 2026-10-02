import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { StudioAccess } from '@/components/interfaces/Settings/StudioAccess/StudioAccess'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import SettingsLayout from '@/components/layouts/ProjectSettingsLayout/SettingsLayout'
import type { NextPageWithLayout } from '@/types'

const StudioAccessPage: NextPageWithLayout = () => (
  <>
    <PageHeader size="small">
      <PageHeaderMeta>
        <PageHeaderSummary>
          <PageHeaderTitle>Studio access</PageHeaderTitle>
          <PageHeaderDescription>
            Who can sign in to this Studio with an email and password
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeaderMeta>
    </PageHeader>
    <PageContainer size="small">
      <StudioAccess />
    </PageContainer>
  </>
)

StudioAccessPage.getLayout = (page) => (
  <DefaultLayout>
    <SettingsLayout title="Studio access">{page}</SettingsLayout>
  </DefaultLayout>
)

export default StudioAccessPage
