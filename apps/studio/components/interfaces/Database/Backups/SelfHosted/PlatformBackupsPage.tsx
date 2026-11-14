import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { PlatformBackups } from './PlatformBackups'
import { DatabaseLayout } from '@/components/layouts/DatabaseLayout/DatabaseLayout'
import { DefaultLayout } from '@/components/layouts/DefaultLayout'
import type { NextPageWithLayout } from '@/types'

/** Self-hosted Database › Backups: the platform's backups of this database. */
export const PlatformBackupsPage: NextPageWithLayout = () => (
  <>
    <PageHeader>
      <PageHeaderMeta>
        <PageHeaderSummary>
          <PageHeaderTitle>Database Backups</PageHeaderTitle>
          <PageHeaderDescription>
            Taken and kept by the platform; restore replaces the live database
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeaderMeta>
    </PageHeader>
    <PageContainer>
      <PlatformBackups />
    </PageContainer>
  </>
)

PlatformBackupsPage.getLayout = (page) => (
  <DefaultLayout>
    <DatabaseLayout title="Backups">{page}</DatabaseLayout>
  </DefaultLayout>
)
