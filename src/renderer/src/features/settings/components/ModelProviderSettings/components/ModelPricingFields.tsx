import { Coins } from "lucide-react"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { useTranslation } from "@/i18n"
import type { ModelPricingFieldsProps } from "../types"

/**
 * 渲染模型计价配置（USD / 百万 token）。
 */
export const ModelPricingFields = ({
  modelKey,
  model,
  updateModelPricing,
}: ModelPricingFieldsProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="mt-4 border-t border-white/8 pt-3">
      <div className="flex items-center gap-1.5">
        <Coins className="h-3.5 w-3.5 text-amber-400" />
        <span className="text-xs font-medium text-white/80">{t("settings.pricingTitle")}</span>
        <LxInfoTooltip markdown={t("settings.pricingDesc")} placement="right" />
      </div>
      <div className="mt-2.5 grid gap-3 @[360px]:grid-cols-2 @[580px]:grid-cols-4">
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.pricingInput")}
          <LxInput
            type="number"
            min={0}
            step="any"
            aria-label={`${modelKey} ${t("settings.pricingInput")}`}
            value={model.pricing?.input || ""}
            onChange={(event) => updateModelPricing(modelKey, "input", event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.pricingOutput")}
          <LxInput
            type="number"
            min={0}
            step="any"
            aria-label={`${modelKey} ${t("settings.pricingOutput")}`}
            value={model.pricing?.output || ""}
            onChange={(event) => updateModelPricing(modelKey, "output", event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.pricingCacheRead")}
          <LxInput
            type="number"
            min={0}
            step="any"
            aria-label={`${modelKey} ${t("settings.pricingCacheRead")}`}
            value={model.pricing?.cacheRead || ""}
            onChange={(event) => updateModelPricing(modelKey, "cacheRead", event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
          {t("settings.pricingCacheWrite")}
          <LxInput
            type="number"
            min={0}
            step="any"
            aria-label={`${modelKey} ${t("settings.pricingCacheWrite")}`}
            value={model.pricing?.cacheWrite || ""}
            onChange={(event) => updateModelPricing(modelKey, "cacheWrite", event.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
