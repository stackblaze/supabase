import type { ProductMenuGroup } from '@/components/ui/ProductMenu/ProductMenu.types'
import { IS_PLATFORM } from '@/lib/constants'

export const generateBranchMenu = (ref: string): ProductMenuGroup[] => {
  return [
    {
      title: 'Manage',
      items: [
        {
          name: 'Branches',
          key: 'branches',
          url: `/project/${ref}/branches`,
          items: [],
        },
        // Merge requests need the platform's schema diff, which self-hosted does not have.
        ...(IS_PLATFORM
          ? [
              {
                name: 'Merge requests',
                key: 'merge-requests',
                url: `/project/${ref}/branches/merge-requests`,
                items: [],
              },
            ]
          : []),
      ],
    },
  ]
}
