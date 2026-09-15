import { Brain } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import type { ModelThinkingVariantsProps } from "../types"

/**
 * 渲染思考等级（variants）预设、默认等级与逐项配置。
 */
export const ModelThinkingVariants = ({
  providerId,
  modelKey,
  model,
  updateProvider,
}: ModelThinkingVariantsProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="mt-4 border-t border-white/8 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-sky-400" />
          <span className="text-xs font-medium text-white/80">
            {t("settings.thinkingVariants")}
          </span>
          <LxInfoTooltip markdown={t("settings.thinkingVariantsDesc")} placement="right" />
        </div>
        <div className="flex items-center gap-1">
          {/* 快速添加预设 */}
          <LxSelect
            value=""
            placeholder={t("settings.addVariant")}
            className="!w-[160px]"
            options={[
              { value: "openai", label: t("settings.presetVariantOpenAI") },
              {
                value: "openrouter",
                label: t("settings.presetVariantOpenRouter"),
              },
              {
                value: "anthropic",
                label: t("settings.presetVariantAnthropic"),
              },
              {
                value: "reasoning_effort",
                label: t("settings.presetVariantReasoningEffort"),
              },
              { value: "custom", label: t("settings.addVariant") },
            ]}
            onChange={(val) => {
              if (!val) return
              updateProvider(providerId, (provider) => {
                const currentModel = provider.models[modelKey]
                const currentVariants = { ...(currentModel.variants ?? {}) }
                let newKey = "high"
                if (val === "openai") {
                  currentVariants["low"] = { reasoningEffort: "low" }
                  currentVariants["medium"] = { reasoningEffort: "medium" }
                  currentVariants["high"] = { reasoningEffort: "high" }
                  newKey = "high"
                } else if (val === "openrouter") {
                  currentVariants["low"] = { reasoning: { effort: "low" } }
                  currentVariants["medium"] = {
                    reasoning: { effort: "medium" },
                  }
                  currentVariants["high"] = { reasoning: { effort: "high" } }
                  newKey = "high"
                } else if (val === "anthropic") {
                  currentVariants["low"] = { thinkingBudget: 4096 }
                  currentVariants["high"] = { thinkingBudget: 16000 }
                  currentVariants["max"] = { thinkingBudget: 32000 }
                  newKey = "high"
                } else if (val === "reasoning_effort") {
                  currentVariants["low"] = { reasoning_effort: "low" }
                  currentVariants["medium"] = { reasoning_effort: "medium" }
                  currentVariants["high"] = { reasoning_effort: "high" }
                  newKey = "high"
                } else {
                  let index = Object.keys(currentVariants).length + 1
                  newKey = `variant-${index}`
                  while (currentVariants[newKey]) {
                    index += 1
                    newKey = `variant-${index}`
                  }
                  currentVariants[newKey] = { reasoningEffort: "high" }
                }
                return {
                  ...provider,
                  models: {
                    ...provider.models,
                    [modelKey]: {
                      ...currentModel,
                      variants: currentVariants,
                      variant: currentModel.variant || newKey,
                    },
                  },
                }
              })
            }}
          />
        </div>
      </div>

      {/* 默认等级设置与已配置的 variants 列表 */}
      <div className="mt-2.5 flex flex-col gap-2">
        {model.variants && Object.keys(model.variants).length > 0 ? (
          <>
            <div className="flex items-center gap-2 text-xs text-white/60">
              <span className="shrink-0">{t("settings.defaultVariant")}:</span>
              <LxSelect
                value={model.variant ?? "default"}
                className="!w-[140px]"
                options={[
                  { value: "default", label: t("settings.defaultVariantNone") },
                  ...Object.keys(model.variants).map((k) => ({
                    value: k,
                    label: k,
                  })),
                ]}
                onChange={(v) => {
                  updateProvider(providerId, (provider) => {
                    const currentModel = provider.models[modelKey]
                    const nextModel = { ...currentModel }
                    if (v === "default") {
                      delete nextModel.variant
                    } else {
                      nextModel.variant = v
                    }
                    return {
                      ...provider,
                      models: {
                        ...provider.models,
                        [modelKey]: nextModel,
                      },
                    }
                  })
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              {Object.entries(model.variants).map(([vKey, vConfig]) => (
                <div
                  key={vKey}
                  className="flex items-center gap-2 rounded bg-white/[0.03] p-1.5 border border-white/6"
                >
                  <div className="w-[120px] shrink-0">
                    <LxInput
                      aria-label={`${vKey} ${t("settings.variantKey")}`}
                      value={vKey}
                      onChange={(event) => {
                        const nextKey = event.target.value.trim()
                        if (!nextKey || nextKey === vKey) return
                        updateProvider(providerId, (provider) => {
                          const currentModel = provider.models[modelKey]
                          const nextVariants: Record<string, Record<string, unknown>> = {}
                          for (const [k, val] of Object.entries(currentModel.variants ?? {})) {
                            if (k === vKey) {
                              nextVariants[nextKey] = val
                            } else {
                              nextVariants[k] = val
                            }
                          }
                          return {
                            ...provider,
                            models: {
                              ...provider.models,
                              [modelKey]: {
                                ...currentModel,
                                variants: nextVariants,
                                variant:
                                  currentModel.variant === vKey ? nextKey : currentModel.variant,
                              },
                            },
                          }
                        })
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1 font-mono">
                    <LxInput
                      aria-label={`${vKey} ${t("settings.variantConfigJson")}`}
                      value={JSON.stringify(vConfig)}
                      onChange={(event) => {
                        try {
                          const parsed = JSON.parse(event.target.value)
                          if (
                            typeof parsed === "object" &&
                            parsed !== null &&
                            !Array.isArray(parsed)
                          ) {
                            updateProvider(providerId, (provider) => ({
                              ...provider,
                              models: {
                                ...provider.models,
                                [modelKey]: {
                                  ...provider.models[modelKey],
                                  variants: {
                                    ...(provider.models[modelKey].variants ?? {}),
                                    [vKey]: parsed as Record<string, unknown>,
                                  },
                                },
                              },
                            }))
                          }
                        } catch {
                          // 输入未闭合时暂不抛出
                        }
                      }}
                    />
                  </div>
                  <LxIconButton
                    preset="delete"
                    aria-label={`${t("common.delete")} ${vKey}`}
                    title={{ content: t("common.delete"), placement: "top" }}
                    onClick={() => {
                      updateProvider(providerId, (provider) => {
                        const currentModel = provider.models[modelKey]
                        const nextVariants = {
                          ...(currentModel.variants ?? {}),
                        }
                        delete nextVariants[vKey]
                        const remainingKeys = Object.keys(nextVariants)
                        return {
                          ...provider,
                          models: {
                            ...provider.models,
                            [modelKey]: {
                              ...currentModel,
                              variants: remainingKeys.length > 0 ? nextVariants : undefined,
                              variant:
                                currentModel.variant === vKey
                                  ? remainingKeys[0]
                                  : currentModel.variant,
                            },
                          },
                        }
                      })
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-1 text-xs text-white/40">{t("settings.noModelsConfigured")}</div>
        )}
      </div>
    </div>
  )
}
