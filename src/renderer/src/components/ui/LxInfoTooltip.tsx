import { Info } from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"

export interface LxInfoTooltipProps {
  /**
   * Markdown 格式的说明文档字符串
   */
  markdown: string
  /**
   * 浮层弹出方向（默认 "top"）
   */
  placement?: "top" | "bottom" | "left" | "right"
  /**
   * 自定义额外类名
   */
  className?: string
  /**
   * 图标尺寸（默认 14px）
   */
  iconSize?: number
  /**
   * 气泡内容额外类名
   */
  contentClassName?: string
  /**
   * 气泡内容最大高度（默认 "max-h-[min(70vh,460px)]"）
   */
  maxHeight?: string | number
}

/**
 * LxInfoTooltip - 说明图标组件
 * 悬停时通过 LxTooltip 弹出展示经过 Markdown 渲染的富文本说明面板。
 */
export const LxInfoTooltip = ({
  markdown,
  placement = "top",
  className = "",
  iconSize = 14,
  contentClassName = "",
  maxHeight,
}: LxInfoTooltipProps): React.JSX.Element => {
  const html = useMemo(() => markdownRenderer.render(markdown), [markdown])

  const parsedMaxHeight = useMemo(() => {
    if (typeof maxHeight === "number") return `${maxHeight}px`
    return maxHeight
  }, [maxHeight])

  const tooltipContent = (
    <div
      className={`custom-scrollbar max-w-[420px] overflow-y-auto text-xs leading-relaxed ${
        !parsedMaxHeight ? "max-h-[min(70vh,460px)]" : ""
      } ${contentClassName}`}
      style={parsedMaxHeight ? { maxHeight: parsedMaxHeight } : undefined}
    >
      <LxMarkdownPreview
        html={html}
        previewMode="preview"
        className="px-0"
        contentClassName="py-0 text-white/80 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-white/95 [&_h4]:text-[12px] [&_h4]:font-semibold [&_h4]:text-white/90 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:mt-1 [&_strong]:text-theme-foreground [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-300"
      />
    </div>
  )

  return (
    <LxTooltip
      content={tooltipContent}
      placement={placement}
      trigger="hover"
      multiline
      closeOnScroll={false}
      closeOnOutsideClick={true}
    >
      <span
        tabIndex={0}
        aria-label="Info"
        className={`inline-flex shrink-0 cursor-help items-center justify-center text-white/40 transition-colors hover:text-white/80 focus:outline-none focus-visible:text-white/90 ${className}`}
      >
        <Info style={{ width: iconSize, height: iconSize }} />
      </span>
    </LxTooltip>
  )
}
