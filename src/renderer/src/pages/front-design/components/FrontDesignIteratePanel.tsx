import { ListChecks, Moon, Shapes, Smartphone, Sparkles } from "lucide-react"
import type React from "react"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import type { DesignIterateActionId } from "@/features/agent/utils/designReviewComposer"
import { type TranslationKey, useTranslation } from "@/i18n"

export interface FrontDesignIteratePanelProps {
  disabled: boolean
  onAction: (action: DesignIterateActionId) => void
}

// 动作列表：图标 + i18n 标签键（指令键按动作拼接）。
const ACTIONS: Array<{
  id: DesignIterateActionId
  icon: React.ReactNode
  labelKey: TranslationKey
}> = [
  { id: "states", icon: <ListChecks />, labelKey: "frontDesign.iterateStates" },
  { id: "responsive", icon: <Smartphone />, labelKey: "frontDesign.iterateResponsive" },
  { id: "dark", icon: <Moon />, labelKey: "frontDesign.iterateDark" },
  { id: "micro", icon: <Sparkles />, labelKey: "frontDesign.iterateMicro" },
  { id: "variant", icon: <Shapes />, labelKey: "frontDesign.iterateVariant" },
]

/**
 * FrontDesignIteratePanel - 快捷迭代下拉内容：5 个常用动作，一键编译为 design 模式消息。
 */
export const FrontDesignIteratePanel = ({
  disabled,
  onAction,
}: FrontDesignIteratePanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="iterate-panel flex w-[212px] flex-col gap-1.5 p-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-white/80">{t("frontDesign.iterateTitle")}</span>
        <span className="text-xs leading-relaxed text-white/40">
          {t("frontDesign.iterateHint")}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {ACTIONS.map((action) => (
          <LxMenuItem
            key={action.id}
            size="small"
            disabled={disabled}
            leading={action.icon}
            onClick={() => onAction(action.id)}
          >
            {t(action.labelKey)}
          </LxMenuItem>
        ))}
      </div>
    </div>
  )
}
