import { CircleDot } from "lucide-react"
import type React from "react"
import { useState } from "react"

import { LxTag, type LxTagColor } from "@/components/ui/LxTag"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例标签颜色。
const TAG_COLORS: LxTagColor[] = [
  "default",
  "blue",
  "teal",
  "emerald",
  "amber",
  "rose",
  "purple",
  "gray",
]

/**
 * 预览 LxTag 组件。
 */
export const LxTagDemo = (): React.JSX.Element => {
  const [tags, setTags] = useState<string[]>(["TypeScript", "React", "Electron"])

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection title="颜色" description="内置多种强调色，highlighted 加深底色">
        <div className="flex flex-wrap gap-2">
          {TAG_COLORS.map((color) => (
            <LxTag key={color} color={color}>
              {color}
            </LxTag>
          ))}
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="尺寸" description="small / default / large">
        <div className="flex flex-wrap items-center gap-2">
          <LxTag size="small">Small</LxTag>
          <LxTag size="default">Default</LxTag>
          <LxTag size="large">Large</LxTag>
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="交互" description="可关闭、可点击与自定义前后缀">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <LxTag
                key={tag}
                highlighted
                onClose={() => setTags((current) => current.filter((item) => item !== tag))}
              >
                {tag}
              </LxTag>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <LxTag color="blue" onClick={() => {}}>
              可点击标签
            </LxTag>
            <LxTag color="rose" prefix={<CircleDot className="h-2.5 w-2.5" />}>
              带前缀
            </LxTag>
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
