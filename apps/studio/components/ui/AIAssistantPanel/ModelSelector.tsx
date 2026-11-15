import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import { useRouter } from 'next/router'
import { useState } from 'react'
import {
  Badge,
  Button,
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from 'ui'

import { useAiModelsQuery } from '@/data/ai/ai-models-query'
import { useCheckEntitlements } from '@/hooks/misc/useCheckEntitlements'
import { useSelectedOrganizationQuery } from '@/hooks/misc/useSelectedOrganization'
import { ASSISTANT_MODELS, isAdvanceOnlyModelId } from '@/lib/ai/model.utils'
import type { AssistantModelId } from '@/lib/ai/model.utils'
import type { AssistantModel } from '@/state/ai-assistant-state'

interface ModelSelectorProps {
  selectedModel: AssistantModel
  onSelectModel: (model: AssistantModel) => void
}

export const ModelSelector = ({ selectedModel, onSelectModel }: ModelSelectorProps) => {
  // Self-hosted on the StackBlaze platform: the AI proxy's models, read at runtime.
  const { data: aiModels } = useAiModelsQuery()
  if (aiModels?.provider === 'stackblaze' && aiModels.models.length > 0) {
    return (
      <ProxyModelSelector
        models={aiModels.models}
        defaultModel={aiModels.defaultModel ?? aiModels.models[0]}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
      />
    )
  }
  return <StudioModelSelector selectedModel={selectedModel} onSelectModel={onSelectModel} />
}

const ProxyModelSelector = ({
  models,
  defaultModel,
  selectedModel,
  onSelectModel,
}: ModelSelectorProps & { models: string[]; defaultModel: string }) => {
  const [open, setOpen] = useState(false)
  // A Studio model id (or one the proxy no longer offers) runs on the proxy's default model.
  const current = models.includes(selectedModel) ? selectedModel : defaultModel

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="text-foreground-light"
          iconRight={<ChevronsUpDownIcon strokeWidth={1} size={12} />}
        >
          {current}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-64" align="start" side="top">
        <Command>
          <CommandList>
            <CommandGroup heading="StackBlaze AI">
              {models.map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  onSelect={() => {
                    onSelectModel(id)
                    setOpen(false)
                  }}
                  className="flex justify-between"
                >
                  <span>{id}</span>
                  {current === id && <CheckIcon className="h-3.5 w-3.5" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const StudioModelSelector = ({ selectedModel, onSelectModel }: ModelSelectorProps) => {
  const router = useRouter()
  const { data: organization } = useSelectedOrganizationQuery()
  const { hasAccess: hasAccessToAdvanceModel, isLoading: isLoadingEntitlements } =
    useCheckEntitlements('assistant.advance_model')

  const [open, setOpen] = useState(false)

  const slug = organization?.slug ?? '_'

  const upgradeHref = `/org/${slug}/billing?panel=subscriptionPlan&source=ai-assistant-model`

  const handleSelectModel = (modelId: AssistantModelId) => {
    if (isLoadingEntitlements && isAdvanceOnlyModelId(modelId)) {
      return
    }
    if (isAdvanceOnlyModelId(modelId) && !hasAccessToAdvanceModel) {
      setOpen(false)
      void router.push(upgradeHref)
      return
    }

    onSelectModel(modelId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="text-foreground-light"
          iconRight={<ChevronsUpDownIcon strokeWidth={1} size={12} />}
        >
          {selectedModel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-44" align="start" side="top">
        <Command>
          <CommandList>
            <CommandGroup>
              {ASSISTANT_MODELS.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.id}
                  disabled={isLoadingEntitlements && isAdvanceOnlyModelId(m.id)}
                  onSelect={() => handleSelectModel(m.id)}
                  className="flex justify-between"
                >
                  <span>{m.id}</span>
                  {isAdvanceOnlyModelId(m.id) &&
                  !hasAccessToAdvanceModel &&
                  !isLoadingEntitlements ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Badge variant="warning">Upgrade</Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {m.id} is available on Pro plans and above
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    selectedModel === m.id && <CheckIcon className="h-3.5 w-3.5" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
