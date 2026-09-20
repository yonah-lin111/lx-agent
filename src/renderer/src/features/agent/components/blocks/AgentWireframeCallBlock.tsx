import { Check, Copy, CornerDownRight, Wrench } from "lucide-react"
import type React from "react"
import { useCallback, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import type { ChatBlock } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>
type ToolResultBlock = Extract<ChatBlock, { kind: "toolResult" }>

export interface AgentWireframeCallBlockProps {
  toolCall: ToolCallBlock
  // 配对的工具结果：失败时隐藏线框图内容，仅呈现错误信息。
  toolResult?: ToolResultBlock
}

// 错误结果中 "Received arguments" 之后是原始参数回显（含完整字符画），消息列表只保留错误原因。
const extractErrorMessage = (text: string): string =>
  (text.split(/\n\s*Received arguments:/)[0] ?? "").trim()

/**
 * AgentWireframeCallBlock - 渲染 wireframe 工具调用：
 * Header 展示工具图标 (Wrench) 与名称 (Wireframe) 及可选标题，正文渲染等宽字符画，
 * 独立成组展示，不参与执行组 (Execute Group) 折叠；调用失败时只展示错误信息。
 */
export const AgentWireframeCallBlock = ({
  toolCall,
  toolResult,
}: AgentWireframeCallBlockProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)

  const title = typeof toolCall.args?.title === "string" ? toolCall.args.title : ""
  const layout = typeof toolCall.args?.layout === "string" ? toolCall.args.layout : ""
  const description =
    typeof toolCall.args?.description === "string" ? toolCall.args.description : ""
  // 调用失败时参数中的布局并不代表已产出内容，仅呈现错误信息，避免渲染出误导性的线框图。
  const isError = toolResult?.isError === true
  const errorMessage = isError ? extractErrorMessage(toolResult?.text ?? "") : ""

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!layout) return
      try {
        await navigator.clipboard.writeText(layout)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2000)
      } catch {
        // clipboard write rejected
      }
    },
    [layout],
  )

  if (!isError && !title && !layout && !description) return null

  return (
    <div className="agent-wireframe-call-block my-1 min-w-0">
      {/* 头部标题与复制快捷操作（失败时无内容可复制） */}
      <div className="agent-wireframe-header flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="agent-wireframe-tool-name font-mono text-xs font-bold text-amber-300">
            Wireframe
          </span>
          {title && (
            <span className="agent-wireframe-title truncate font-mono text-xs text-white/60">
              {title}
            </span>
          )}
        </div>
        {layout && !isError && (
          <LxIconButton
            size="small"
            aria-label={t("agent.wireframeCopy")}
            title={{
              content: isCopied ? t("agent.wireframeCopied") : t("agent.wireframeCopy"),
              placement: "top",
            }}
            onClick={handleCopy}
          >
            {isCopied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]" />
            )}
          </LxIconButton>
        )}
      </div>

      {/* 缩进内容区 */}
      <div className="mt-1 flex min-w-0 items-start gap-1.5 pl-1">
        <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
        {isError ? (
          /* 失败调用：只展示错误原因，不渲染描述、字符画与原始参数回显。 */
          <div className="min-w-0 flex-1 rounded-[6px] border border-rose-500/20 bg-rose-950/20 p-2 font-mono text-xs leading-relaxed text-rose-200 whitespace-pre-wrap break-words">
            {errorMessage || "-"}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {description && (
              <div className="text-xs leading-relaxed text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
                <span className="font-medium text-white/50">
                  {t("agent.wireframeDescription")}:{" "}
                </span>
                <span>{description}</span>
              </div>
            )}

            <div className="rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.08))] bg-black/40 p-2.5">
              <pre className="font-mono text-xs leading-tight text-sky-200/90 whitespace-pre overflow-x-auto selection:bg-sky-500/30">
                {layout || (
                  <span className="text-white/40 italic">{t("agent.wireframeEmpty")}</span>
                )}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
