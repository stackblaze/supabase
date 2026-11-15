import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderNavigationTabs,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import DatabaseBackupsNav from '../DatabaseBackupsNav'
import { PlatformBackups } from './PlatformBackups'
import { PlatformPitr } from './PlatformPitr'
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
      <PageHeaderNavigationTabs>
        <DatabaseBackupsNav active="scheduled" />
      </PageHeaderNavigationTabs>
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

/** Self-hosted Database › Backups › Point in time: the platform's PITR (kubero-server #2407). */
export const PlatformPitrPage: NextPageWithLayout = () => (
  <>
    <PageHeader>
      <PageHeaderMeta>
        <PageHeaderSummary>
          <PageHeaderTitle>Database Backups</PageHeaderTitle>
          <PageHeaderDescription>
            Restore the project to any second inside the retention window
          </PageHeaderDescription>
        </PageHeaderSummary>
      </PageHeaderMeta>
      <PageHeaderNavigationTabs>
        <DatabaseBackupsNav active="pitr" />
      </PageHeaderNavigationTabs>
    </PageHeader>
    <PageContainer>
      <PlatformPitr />
    </PageContainer>
  </>
)

PlatformPitrPage.getLayout = PlatformBackupsPage.getLayout
