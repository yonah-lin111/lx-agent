import { Bot, Copy, SlidersHorizontal } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ProviderModelRowProps } from "../types"
import { FetchedModelsContent } from "./FetchedModelsContent"
import { ModelLimitFields } from "./ModelLimitFields"
import { ModelPricingFields } from "./ModelPricingFields"
import { ModelThinkingVariants } from "./ModelThinkingVariants"

/**
 * 渲染单个模型卡片：基础字段、操作按钮与可展开的高级配置。
 */
export const ProviderModelRow = ({
  providerId,
  modelKey,
  model,
  isExpanded,
  onToggleExpanded,
  updateProvider,
  updateModelPricing,
  onDuplicateModel,
  fetchedModels,
  modelListQuery,
  onModelListQueryChange,
  onApplyFetchedModel,
}: ProviderModelRowProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="settings-model-card rounded-[6px] border border-white/8 bg-white/[0.04] p-3">
      <div className="grid gap-2 grid-cols-1 @[380px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.modelId")}
          <LxInput
            aria-label={`${modelKey} ${t("settings.modelId")}`}
            value={model.id}
            onChange={(event) =>
              updateProvider(providerId, (provider) => ({
                ...provider,
                models: {
                  ...provider.models,
                  [modelKey]: {
                    ...provider.models[modelKey],
                    id: event.target.value,
                  },
                },
              }))
            }
          />
        </label>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.modelName")}
          <LxInput
            aria-label={`${modelKey} ${t("settings.modelName")}`}
            value={model.name}
            onChange={(event) =>
              updateProvider(providerId, (provider) => ({
                ...provider,
                models: {
                  ...provider.models,
                  [modelKey]: {
                    ...provider.models[modelKey],
                    name: event.target.value,
                  },
                },
              }))
            }
          />
        </label>
        <div className="flex items-center justify-end gap-1 @[380px]:mt-[22px]">
          {fetchedModels !== undefined ? (
            <LxTooltip
              placement="top"
              trigger="click"
              multiline
              closeOnContentClick
              contentClassName="w-[350px] h-[200px]"
              content={
                <FetchedModelsContent
                  models={fetchedModels}
                  query={modelListQuery}
                  onQueryChange={onModelListQueryChange}
                  onApply={onApplyFetchedModel}
                />
              }
            >
              <LxIconButton aria-label={`${model.id} ${t("settings.modelsList")}`}>
                <Bot />
              </LxIconButton>
            </LxTooltip>
          ) : null}
          <LxIconButton
            aria-label={`${model.id} ${t("common.edit")}`}
            title={{ content: t("common.edit"), placement: "top" }}
            highlighted={isExpanded}
            onClick={onToggleExpanded}
          >
            <SlidersHorizontal />
          </LxIconButton>
          <LxIconButton
            aria-label={`${t("common.copy")} ${model.id}`}
            title={{ content: t("common.copy"), placement: "top" }}
            onClick={onDuplicateModel}
          >
            <Copy />
          </LxIconButton>
          <LxIconButton
            preset="delete"
            aria-label={`${t("common.delete")} ${model.id}`}
            title={{ content: t("common.delete"), placement: "top" }}
            onClick={() =>
              updateProvider(providerId, (provider) => {
                const models = { ...provider.models }
                delete models[modelKey]
                return { ...provider, models }
              })
            }
          />
        </div>
      </div>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ModelLimitFields
            providerId={providerId}
            modelKey={modelKey}
            model={model}
            updateProvider={updateProvider}
          />
          <ModelPricingFields
            modelKey={modelKey}
            model={model}
            updateModelPricing={updateModelPricing}
          />
          <ModelThinkingVariants
            providerId={providerId}
            modelKey={modelKey}
            model={model}
            updateProvider={updateProvider}
          />
        </div>
      </div>
    </div>
  )
}
