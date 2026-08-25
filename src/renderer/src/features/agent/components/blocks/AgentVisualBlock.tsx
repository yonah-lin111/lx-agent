import { ChevronDown, Code2, CornerDownRight, Palette, Terminal } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { AgentQuestionGraphic } from "@/features/agent/components/AgentQuestionGraphic"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

export interface AgentVisualBlockProps {
  toolCall: ToolCallBlock
}

// 可视化工具类型配置。
const VISUAL_CONFIGS = {
  render_svg: {
    name: "SVG Diagram",
    icon: Palette,
    iconColor: "text-sky-400",
  },
  render_ascii: {
    name: "ASCII Diagram",
    icon: Terminal,
    iconColor: "text-emerald-400",
  },
  render_html: {
    name: "HTML View",
    icon: Code2,
    iconColor: "text-amber-400",
  },
} as const

/**
 * AgentVisualBlock - 渲染解释性可视化工具（render_svg / render_ascii / render_html）：
 * 在消息流内直接展示图形/字符画/HTML 结构化内容以及伴随的 Markdown 说明文本。
 * 默认展开展示，支持折叠收起。
 */
export const AgentVisualBlock = ({ toolCall }: AgentVisualBlockProps): React.JSX.Element | null => {
  const [isExpanded, setIsExpanded] = useState(true)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const toolName = toolCall.toolName as keyof typeof VISUAL_CONFIGS
  const config = VISUAL_CONFIGS[toolName] ?? VISUAL_CONFIGS.render_svg
  const Icon = config.icon

  const args = (toolCall.args ?? {}) as {
    title?: string
    description?: string
    svg?: string
    ascii?: string
    html?: string
  }

  const title = args.title?.trim()
  const description = args.description?.trim()
  const graphicContent = useMemo(() => {
    if (toolName === "render_svg") return args.svg || ""
    if (toolName === "render_ascii") return args.ascii || ""
    if (toolName === "render_html") return args.html || ""
    return args.svg || args.ascii || args.html || ""
  }, [toolName, args.svg, args.ascii, args.html])

  // 展开时测量高度，支撑平滑折叠动画。
  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element || !isExpanded) {
      setContentHeight(null)
      return undefined
    }

    const updateHeight = (): void => setContentHeight(element.scrollHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [isExpanded, graphicContent, description])

  if (!graphicContent && !description && !title) return null

  return (
    <div className="agent-visual-block my-0.5 min-w-0">
      {/* 头部可折叠按钮 */}
      <button
        type="button"
        aria-expanded={isExpanded}
        className="agent-visual-header flex h-5 w-fit items-center gap-1 pr-2 text-[12px] transition-all duration-200 hover:text-white/70 focus:outline-none cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${config.iconColor}`} />
        <span className={`agent-visual-name font-mono text-[12px] font-bold ${config.iconColor}`}>
          {title || config.name}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/45 transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
      </button>

      {/* 展开内容容器 */}
      <div
        style={{
          maxHeight: isExpanded
            ? contentHeight !== null
              ? `${contentHeight}px`
              : `${innerRef.current?.scrollHeight ?? 0}px`
            : "0px",
          opacity: isExpanded ? 1 : 0,
          transition:
            "max-height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)",
        }}
        className="overflow-hidden"
      >
        <div ref={innerRef} className="mt-1 flex min-w-0 items-start gap-1 pb-1 pl-1">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {/* 伴随 Markdown 说明文本 */}
            {description && (
              <LxMarkdownPreview
                html={markdownRenderer.render(description)}
                previewMode="preview"
                className="px-0"
                contentClassName="py-0.5 text-[12px] text-white/80"
                sanitizeCopy
              />
            )}

            {/* 可视化图形面板 */}
            {graphicContent && <AgentQuestionGraphic content={graphicContent} className="my-0" />}
          </div>
        </div>
      </div>
    </div>
  )
}
