import { Check, ChevronDown, ChevronRight, Copy, FileText, Terminal, Wrench } from "lucide-react"
import type React from "react"
import { useCallback, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatDurationMs, formatJsonString } from "../types"

export interface FlowToolWireframeProps {
  content: ExecutionToolContent
}

export const FlowToolWireframe = ({ content }: FlowToolWireframeProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  const title = typeof content.args?.title === "string" ? content.args.title : ""
  const layout = typeof content.args?.layout === "string" ? content.args.layout : ""
  const description = typeof content.args?.description === "string" ? content.args.description : ""
  // 调用失败时参数中的布局并不代表已产出内容，仅呈现错误信息，避免渲染出误导性的线框图。
  const isError = content.isError === true

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const copyText = layout || formatJsonString(content.args)
      if (!copyText) return
      try {
        await navigator.clipboard.writeText(copyText)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      } catch {
        // clipboard access denied or failed
      }
    },
    [layout, content.args],
  )

  return (
    <div className="agent-execution-flow-tool-wireframe flex flex-col gap-2.5">
      {isError ? (
        /* 失败调用：只展示错误信息，不渲染标题、描述与字符画。 */
        <div className="rounded border border-rose-500/20 bg-rose-950/20 p-2 font-mono text-xs text-rose-200">
          <FlowItemExpandableText content={content.result ?? ""} fallbackText="-" maxLines={3} />
        </div>
      ) : (
        <>
          {/* 头部：线框图标题与操作 */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 font-mono text-xs">
            <div className="flex items-center gap-1.5 text-amber-300">
              <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span className="font-bold text-amber-300">Wireframe</span>
              {title && <span className="font-medium text-white/70">{title}</span>}
            </div>
            <div className="flex items-center gap-2">
              {content.durationMs !== undefined && (
                <LxTag size="small" color="default">
                  <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
                </LxTag>
              )}
              <LxIconButton
                size="small"
                aria-label={t("agent.wireframeCopy")}
                title={{
                  content: isCopied ? t("agent.wireframeCopied") : t("agent.wireframeCopy"),
                  placement: "left",
                }}
                onClick={handleCopy}
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]" />
                )}
              </LxIconButton>
            </div>
          </div>

          {/* 描述信息（若有） */}
          {description && (
            <div className="text-xs leading-relaxed text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
              <span className="font-medium text-white/50">{t("agent.wireframeDescription")}: </span>
              <span>{description}</span>
            </div>
          )}

          {/* 字符线框图等宽展示区 */}
          <div className="rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.08))] bg-black/40 p-2.5">
            <pre className="font-mono text-xs leading-tight text-sky-200/90 whitespace-pre overflow-x-auto selection:bg-sky-500/30">
              {layout || <span className="text-white/40 italic">{t("agent.wireframeEmpty")}</span>}
            </pre>
          </div>
        </>
      )}

      {/* 原始调用调试信息折叠区 */}
      <div className="border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] pt-1 font-mono text-xs">
        <button
          type="button"
          onClick={() => setShowDebug((prev) => !prev)}
          className="flex items-center gap-1 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] hover:text-[var(--color-theme-text,rgba(255,255,255,0.8))] transition-colors"
        >
          {showDebug ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{t("agent.todoRawDebug")}</span>
        </button>

        {showDebug && (
          <div className="mt-2 flex flex-col gap-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-white/45">
                <span className="flex items-center gap-1">
                  <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
                </span>
                {content.toolCallId && (
                  <span className="text-xs text-white/30">ID: {content.toolCallId}</span>
                )}
              </div>
              <div className="rounded bg-black/40 p-2 text-sky-200/90">
                <FlowItemExpandableText content={formatJsonString(content.args)} maxLines={3} />
              </div>
            </div>

            {content.result !== undefined && (
              <div>
                <div className="mb-1 flex items-center justify-between text-white/45">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {t("agent.toolResult")}
                  </span>
                  {content.isError && (
                    <span className="text-xs text-rose-400 font-medium">ERROR</span>
                  )}
                </div>
                <div
                  className={`rounded p-2 ${
                    content.isError
                      ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                      : "bg-black/40 text-white/80"
                  }`}
                >
                  <FlowItemExpandableText content={content.result} fallbackText="-" maxLines={3} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
