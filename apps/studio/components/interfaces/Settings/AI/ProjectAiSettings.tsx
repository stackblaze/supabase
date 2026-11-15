import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button, Card, CardContent, cn, RadioGroup, RadioGroupItem } from 'ui'
import { Admonition } from 'ui-patterns/Admonition'
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import {
  useProjectAiSettingsMutation,
  useProjectAiSettingsQuery,
} from '@/data/ai/project-ai-settings-query'
import type { AiOptInLevel } from '@/hooks/misc/useOrgOptedIntoAi'

/** Supabase's four AI data levels, described by what reaches the model provider. */
export const PROJECT_AI_LEVELS: { value: AiOptInLevel; title: string; sent: string }[] = [
  {
    value: 'disabled',
    title: 'Disabled',
    sent: 'Nothing from this project is sent. You can still ask the assistant general questions; its answers are not tailored to your database.',
  },
  {
    value: 'schema',
    title: 'Schema only (default)',
    sent: 'Schema metadata is sent: table and column names, data types, relationships, policies and functions. No rows, no logs.',
  },
  {
    value: 'schema_and_log',
    title: 'Schema & logs',
    sent: 'Schema metadata and your logs, which may contain personal data or values from your database.',
  },
  {
    value: 'schema_and_log_and_data',
    title: 'Schema, logs & database data',
    sent: 'Schema, logs and the results of queries the assistant runs (with your approval), so it can answer questions about your data.',
  },
]

/**
 * Project Settings → AI (self-hosted): how much of this project the AI model may see. Stored in
 * the project's own database (supabase_studio.settings) and read by every AI request.
 */
export const ProjectAiSettings = () => {
  const { data, isPending, isError, error } = useProjectAiSettingsQuery()
  const save = useProjectAiSettingsMutation()
  const [selected, setSelected] = useState<AiOptInLevel>()

  useEffect(() => {
    if (data && selected === undefined) setSelected(data.aiOptInLevel)
  }, [data, selected])

  const current = data?.aiOptInLevel
  const isDirty = selected !== undefined && selected !== current

  return (
    <>
      <PageHeader size="small">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>AI</PageHeaderTitle>
            <PageHeaderDescription>
              What the AI assistant may see of this project
            </PageHeaderDescription>
          </PageHeaderSummary>
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size="small">
        {isPending ? (
          <GenericSkeletonLoader />
        ) : isError ? (
          <Admonition
            type="destructive"
            title="Could not load the AI setting"
            description={error.message}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-foreground-light">
                The assistant, SQL generation and the other AI helpers send what you allow here to
                the AI model provider (on StackBlaze, through the StackBlaze AI service). The
                setting applies to everyone who signs in to this Studio and takes effect on the next
                request.
              </p>
              <RadioGroup
                value={selected}
                onValueChange={(value) => setSelected(value as AiOptInLevel)}
                disabled={save.isPending}
                className="space-y-2"
              >
                {PROJECT_AI_LEVELS.map((level) => (
                  <div
                    key={level.value}
                    className={cn(
                      '-mx-3 flex items-start space-x-3 rounded-md border border-transparent p-3',
                      level.value === selected && 'border-brand-500/40 bg-brand-default/5'
                    )}
                  >
                    <RadioGroupItem
                      value={level.value}
                      id={`project-ai-${level.value}`}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`project-ai-${level.value}`}
                      className="flex cursor-pointer flex-col"
                    >
                      <span className="text-sm font-medium text-foreground">{level.title}</span>
                      <span className="text-sm text-foreground-light">{level.sent}</span>
                    </label>
                  </div>
                ))}
              </RadioGroup>
              <div className="flex justify-end gap-2">
                <Button
                  variant="default"
                  disabled={!isDirty || save.isPending}
                  onClick={() => setSelected(current)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={save.isPending}
                  disabled={!isDirty}
                  onClick={() =>
                    selected &&
                    save.mutate(
                      { aiOptInLevel: selected },
                      {
                        onSuccess: () => toast.success('AI setting saved'),
                        onError: (e: Error) => toast.error(e.message),
                      }
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </PageContainer>
    </>
  )
}
