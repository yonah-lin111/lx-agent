import { Code2, FileText, Palette, Terminal } from "lucide-react"
import type React from "react"
import {
  AsciiVisualContent,
  HtmlVisualContent,
  SvgVisualContent,
} from "@/features/agent/components/visuals"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatJsonString } from "../types"

export interface FlowToolVisualProps {
  content: ExecutionToolContent
}

/**
 * FlowToolVisual - 执行流程列表中展示 render_svg / render_ascii / render_html 的专用面板：
 * 包含 Rendered Preview（置顶）、Input Arguments（输入参数）与 Execution Result（执行结果）。
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
      {/* 1. Visual Graphic Preview (置于首位) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1 text-white/45">
          {toolName === "render_svg" && <Palette className="h-3 w-3 text-sky-400" />}
          {toolName === "render_ascii" && <Terminal className="h-3 w-3 text-emerald-400" />}
          {toolName === "render_html" && <Code2 className="h-3 w-3 text-amber-400" />}
          <span>Rendered Preview</span>
        </div>
        {graphicContent ? (
          <>
            {toolName === "render_svg" && <SvgVisualContent svg={args.svg} className="my-0" />}
            {toolName === "render_ascii" && (
              <AsciiVisualContent ascii={args.ascii} className="my-0" />
            )}
            {toolName === "render_html" && (
              <HtmlVisualContent html={args.html} customStyle={args.style} className="my-0" />
            )}
          </>
        ) : (
          <div className="rounded border border-white/5 bg-black/40 p-2 text-white/40">
            (No render content)
          </div>
        )}
      </div>

      {/* 2. Input Arguments (输入参数，最多 3 行折叠) */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-white/45">
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
          </span>
          {content.toolCallId && (
            <span className="text-[10px] text-white/30">ID: {content.toolCallId}</span>
          )}
        </div>
        <div className="rounded bg-black/40 p-2 text-sky-200/90">
          <FlowItemExpandableText content={formatJsonString(content.args)} maxLines={3} />
        </div>
      </div>

      {/* 3. Execution Result (执行结果，最多 3 行折叠) */}
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
  )
}
