import { ChevronDown, ChevronRight, FileText, Terminal } from "lucide-react"
import type React from "react"
import { useId, useState } from "react"
import { useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatJsonString } from "../types"

export interface FlowToolArgsSectionProps {
  args: Record<string, unknown>
  toolCallId?: string
}

/**
 * 工具参数折叠区（样式对齐 FlowToolTodo 的原始参数区）：
 * 标题行展示终端图标与「输入参数」，默认折叠，展开后展示 JSON 参数。
 */
export const FlowToolArgsSection = ({
  args,
  toolCallId,
}: FlowToolArgsSectionProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()

  return (
    <div className="agent-execution-flow-tool-args-section border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] pt-1 font-mono text-xs">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] transition-colors hover:text-[var(--color-theme-text,rgba(255,255,255,0.8))]"
        >
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" />
            {t("agent.toolArgs")}
          </span>
        </button>
        {toolCallId && <span className="text-xs text-white/30">ID: {toolCallId}</span>}
      </div>

      {isOpen && (
        <div id={contentId} className="mt-2 rounded bg-black/40 p-2 text-sky-200/90">
          <FlowItemExpandableText content={formatJsonString(args)} maxLines={3} />
        </div>
      )}
    </div>
  )
}

export interface FlowToolResultSectionProps {
  result?: string
  isError?: boolean
  fallbackText?: string
}

/**
 * 工具结果区：统一的标题行（图标 + 「执行结果」 + ERROR 标注）与结果容器。
 */
export const FlowToolResultSection = ({
  result,
  isError,
  fallbackText = "-",
}: FlowToolResultSectionProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-tool-result-section flex flex-col gap-1 font-mono text-xs">
      <div className="flex items-center justify-between text-white/45">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" /> {t("agent.toolResult")}
        </span>
        {isError && <span className="text-xs font-medium text-rose-400">ERROR</span>}
      </div>
      <div
        className={`rounded p-2 ${
          isError
            ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
            : "bg-black/40 text-white/80"
        }`}
      >
        <FlowItemExpandableText content={result ?? ""} fallbackText={fallbackText} maxLines={3} />
      </div>
    </div>
  )
}
