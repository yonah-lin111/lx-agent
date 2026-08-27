import type { CollaborationMode } from "@shared/contracts/agent"
import { Compass, Zap } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

interface CollaborationModeButtonProps {
  mode?: CollaborationMode
  onToggle?: () => void
}

/**
 * Agent 状态栏协作模式指示与切换按钮 (Default / Plan Mode)
 */
export const CollaborationModeButton = ({
  mode = "default",
  onToggle,
}: CollaborationModeButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isPlan = mode === "plan"

  return (
    <LxTooltip
      placement="top"
      content={
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-semibold text-white/90">
            {isPlan ? "Plan Mode (规划模式)" : "Default Mode (默认模式)"}
          </span>
          <span className="text-white/60">
            {isPlan
              ? "严格只读探索，禁止文件修改，聚焦生成决策完备的实施方案。"
              : "标准执行模式，支持精准修改与工具调用。"}
          </span>
        </div>
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs transition-colors hover:bg-white/5 ${
          isPlan ? "text-sky-400 font-medium" : "text-white/60"
        }`}
      >
        {isPlan ? <Compass className="h-3.5 w-3.5 shrink-0" /> : <Zap className="h-3.5 w-3.5 shrink-0" />}
        <span className="capitalize">{mode}</span>
      </button>
    </LxTooltip>
  )
}
