import { Code2, FileText, Palette, Terminal } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import { AgentQuestionGraphic } from "@/features/agent/components/AgentQuestionGraphic"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatDurationMs, formatJsonString } from "../types"

export interface FlowToolVisualProps {
  content: ExecutionToolContent
}

/**
 * FlowToolVisual - 执行流程列表中展示 render_svg / render_ascii / render_html 的专用面板：
 * 包含类型徽标、Input Arguments（输入参数）、渲染视图与 Execution Result（执行结果）。
 */
export const FlowToolVisual = ({ content }: FlowToolVisualProps): React.JSX.Element => {
  const { t } = useTranslation()
  const toolName = content.toolName
  const args = (content.args ?? {}) as {
    svg?: string
    ascii?: string
    html?: string
    style?: string
  }

  const graphicContent =
    toolName === "render_svg"
      ? args.svg || ""
      : toolName === "render_ascii"
        ? args.ascii || ""
        : toolName === "render_html"
          ? args.html || ""
          : ""

  const isRunning = !content.result && !content.isError

  return (
    <div className="agent-execution-flow-tool-visual flex flex-col gap-2.5 font-mono text-[11px]">
      {/* 头部类型与状态徽标 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {toolName === "render_svg" && (
            <LxTag size="small" color="sky">
              <span className="flex items-center gap-1 font-mono text-sky-300">
                <Palette className="h-3 w-3" /> SVG Diagram
              </span>
            </LxTag>
          )}
          {toolName === "render_ascii" && (
            <LxTag size="small" color="emerald">
              <span className="flex items-center gap-1 font-mono text-emerald-300">
                <Terminal className="h-3 w-3" /> ASCII Diagram
              </span>
            </LxTag>
          )}
          {toolName === "render_html" && (
            <LxTag size="small" color="amber">
              <span className="flex items-center gap-1 font-mono text-amber-300">
                <Code2 className="h-3 w-3" /> HTML View
              </span>
            </LxTag>
          )}
          {args.style && (
            <LxTag size="small" color="default">
              <span className="font-mono text-white/50">custom style</span>
            </LxTag>
          )}
          {content.isError && (
            <LxTag size="small" color="rose">
              <span className="text-rose-300">error</span>
            </LxTag>
          )}
        </div>

        {content.durationMs !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
          </LxTag>
        )}
      </div>

      {/* 1. Input Arguments (输入参数) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-white/45">
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
          </span>
          {content.toolCallId && (
            <span className="text-[10px] text-white/30">ID: {content.toolCallId}</span>
          )}
        </div>
        <div className="custom-scrollbar max-h-40 overflow-y-auto rounded bg-black/40 p-2 text-sky-200/90 break-all whitespace-pre-wrap">
          {formatJsonString(content.args)}
        </div>
      </div>

      {/* 2. Visual Graphic Preview */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1 text-white/45">
          {toolName === "render_svg" && <Palette className="h-3 w-3 text-sky-400" />}
          {toolName === "render_ascii" && <Terminal className="h-3 w-3 text-emerald-400" />}
          {toolName === "render_html" && <Code2 className="h-3 w-3 text-amber-400" />}
          <span>Rendered Preview</span>
        </div>
        {graphicContent ? (
          <AgentQuestionGraphic
            content={graphicContent}
            customStyle={args.style}
            className="my-0"
          />
        ) : isRunning ? (
          <div className="flex items-center gap-2 rounded-[6px] border border-white/5 bg-[#0d0d0d] px-3 py-2 text-white/50">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
            <span>Rendering content...</span>
          </div>
        ) : (
          <div className="rounded border border-white/5 bg-black/40 p-2 text-white/40">
            (No render content)
          </div>
        )}
      </div>

      {/* 3. Execution Result (执行结果) */}
      {content.result !== undefined && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-white/45">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
            {content.isError && (
              <span className="text-[10px] font-medium text-rose-400">ERROR</span>
            )}
          </div>
          <div
            className={`custom-scrollbar max-h-48 overflow-y-auto rounded p-2 leading-relaxed break-all whitespace-pre-wrap ${
              content.isError
                ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            {content.result || <span className="text-white/30">-</span>}
          </div>
        </div>
      )}
    </div>
  )
}
