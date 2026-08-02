import { useState } from "react"
import {
  getMarkdownReferenceImageSource,
  getMarkdownReferenceName,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"

// 本地图片 Tooltip 内容属性。
interface MarkdownReferenceImageTooltipProps {
  path: string
}

/**
 * 渲染本地图片预览，并在加载失败时提供反馈。
 */
export const MarkdownReferenceImageTooltip = ({
  path,
}: MarkdownReferenceImageTooltipProps): React.JSX.Element => {
  const [hasError, setHasError] = useState(false)

  if (hasError) return <span className="whitespace-nowrap">图片加载失败</span>

  return (
    <div className="w-fit min-w-40 max-w-[min(30rem,calc(100vw-1rem))]">
      <img
        alt={getMarkdownReferenceName(path)}
        className="mx-auto block h-auto max-h-90 max-w-full rounded-[4px] object-contain"
        src={getMarkdownReferenceImageSource(path)}
        onError={() => setHasError(true)}
      />
    </div>
  )
}
