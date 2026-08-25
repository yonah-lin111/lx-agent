import { Code2, Palette, Terminal } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import { AgentQuestionGraphic } from "@/features/agent/components/AgentQuestionGraphic"
import type { ExecutionToolContent } from "@/features/agent/types"

export interface FlowToolVisualProps {
  content: ExecutionToolContent
}

/**
 * FlowToolVisual - 执行流程列表中展示 render_svg / render_ascii / render_html 的专用面板
 */
export const FlowToolVisual = ({ content }: FlowToolVisualProps): React.JSX.Element => {
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
    <div className="agent-execution-flow-tool-visual flex flex-col gap-2">
      {/* 头部类型与状态徽标 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
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

      {/* 图形与结构化渲染展示 */}
      {graphicContent ? (
        <AgentQuestionGraphic content={graphicContent} customStyle={args.style} className="my-0" />
      ) : isRunning ? (
        <div className="flex items-center gap-2 rounded-[6px] border border-white/5 bg-[#0d0d0d] px-3 py-2 text-[11px] text-white/50 font-mono">
          <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
          <span>正在渲染内容...</span>
        </div>
      ) : (
        <div className="rounded border border-white/5 bg-black/40 p-2.5 text-[11px] text-white/40 font-mono">
          (无渲染内容)
        </div>
      )}
    </div>
  )
}
