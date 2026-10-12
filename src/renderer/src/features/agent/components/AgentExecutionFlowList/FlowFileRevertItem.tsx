import type { AgentFileRevertMark } from "@shared/contracts/agent"
import { ChevronDown, RotateCcw } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { useTranslation } from "@/i18n"

export interface FlowFileRevertItemProps {
  // 该轮已回退文件标记（按回退时间展示）。
  marks: AgentFileRevertMark[]
  className?: string
}

/**
 * 执行流"已回退文件"item：挂在被回退文件所属源轮的末尾（文件统计卡片之后），
 * 折叠态显示文件数，展开逐文件显示路径与最近回退时间。仅执行流展示，消息列表不渲染。
 */
export const FlowFileRevertItem = ({
  marks,
  className = "",
}: FlowFileRevertItemProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      data-testid="flow-file-revert-item"
      className={`agent-flow-file-revert w-full min-w-0 ${className}`}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((previous) => !previous)}
        className="agent-flow-file-revert-header flex w-full items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-xs text-amber-300/90 transition-colors hover:bg-white/5 focus:outline-none"
      >
        <RotateCcw className="agent-flow-file-revert-icon h-3.5 w-3.5 shrink-0" />
        <span className="agent-flow-file-revert-count shrink-0">
          {marks.length === 1
            ? t("agent.fileRevertItemTitleSingular")
            : t("agent.fileRevertItemTitle", { count: marks.length })}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/35 transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          } ml-auto`}
        />
      </button>
      {isExpanded && (
        <div className="agent-flow-file-revert-list mt-1 flex w-full flex-col gap-0.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.08))] bg-black/20 p-1">
          {marks.map((mark) => (
            <LxNavItem
              key={`${mark.userMessageTimestamp}:${mark.file}`}
              level={3}
              size="small"
              className="agent-flow-file-revert-item"
              label={mark.file}
              labelClassName="agent-flow-file-revert-path font-mono text-white/60"
              suffix={
                <span className="agent-flow-file-revert-time shrink-0 text-white/35">
                  {new Date(mark.revertedAt).toLocaleString()}
                </span>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
