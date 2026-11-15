import { useParams } from 'common'
import Link from 'next/link'

import { executeSqlOutputSchema } from '@/lib/ai/tools/execute-sql-output'
import { IS_PLATFORM } from '@/lib/constants'

/**
 * Self-hosted: tells the user (not the model) when query rows were kept from the Assistant by the
 * project's AI data setting, and where to change it. The model only learns that the rows were not
 * shared, with nothing it could read as an instruction to change settings.
 */
export function SelfHostedDataHint({ output }: { output: unknown }) {
  const { ref } = useParams()
  if (IS_PLATFORM) return null
  const parsed = executeSqlOutputSchema.safeParse(output)
  if (!parsed.success || parsed.data.optInLevel === 'schema_and_log_and_data') return null

  return (
    <p className="text-xs text-foreground-lighter px-1">
      The assistant can't see table data. A project admin can allow it in{' '}
      <Link
        href={`/project/${ref ?? 'default'}/settings/ai`}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Project Settings → AI
      </Link>
      .
    </p>
  )
}
