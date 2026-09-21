import { ChevronDown, ChevronRight, FileText, Terminal } from "lucide-react"
import type React from "react"
import { useId, useState } from "react"
import { useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatJsonString } from "../types"

export interface FlowToolRawSectionProps {
  args: Record<string, unknown>
  result?: string
  isError?: boolean
  toolCallId?: string
  // 无独立正文的工具（详情展开后只有参数与结果）直接内联展示，不提供折叠。
  collapsible?: boolean
}

/**
 * 工具原始数据区（输入参数 + 执行结果，样式对齐 FlowToolTodo）：
 * 默认折叠在详情底部，展开后依次展示「输入参数」与「执行结果」；
 * 无独立正文时（collapsible=false）直接内联展示，避免出现空荡的折叠行。
 */
export const FlowToolRawSection = ({
  args,
  result,
  isError,
  toolCallId,
  collapsible = true,
}: FlowToolRawSectionProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const contentId = useId()
  const isExpanded = !collapsible || isOpen

  return (
    <div
      data-collapsible={collapsible}
      className={`agent-execution-flow-tool-raw-section font-mono text-xs ${
        collapsible ? "border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] pt-1" : ""
      }`}
    >
      {collapsible && (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] transition-colors hover:text-[var(--color-theme-text,rgba(255,255,255,0.8))]"
        >
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{t("agent.toolRawDebug")}</span>
        </button>
      )}

      {isExpanded && (
        <div id={contentId} className={`flex flex-col gap-2 ${collapsible ? "mt-2" : ""}`}>
          <div>
            <div className="mb-1 flex items-center justify-between text-white/45">
              <span className="flex items-center gap-1">
                <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
              </span>
              {toolCallId && <span className="text-xs text-white/30">ID: {toolCallId}</span>}
            </div>
            <div className="rounded bg-black/40 p-2 text-sky-200/90">
              <FlowItemExpandableText content={formatJsonString(args)} maxLines={3} />
            </div>
          </div>

          {result !== undefined && (
            <div>
              <div className="mb-1 flex items-center justify-between text-white/45">
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
                <FlowItemExpandableText content={result} maxLines={3} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
