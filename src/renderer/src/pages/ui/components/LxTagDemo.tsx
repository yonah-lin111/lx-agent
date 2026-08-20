import { CircleDot } from "lucide-react"
import type React from "react"
import { useState } from "react"

import { LxTag, type LxTagColor } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
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
  const { t } = useTranslation()
  const [tags, setTags] = useState<string[]>(["TypeScript", "React", "Electron"])

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.tagColors")}
        description={t("uiPreview.demos.tagColorsDesc")}
      >
        <div className="flex flex-wrap gap-2">
          {TAG_COLORS.map((color) => (
            <LxTag key={color} color={color}>
              {color}
            </LxTag>
          ))}
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.tagSizes")}
        description={t("uiPreview.demos.tagSizesDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LxTag size="small">Small</LxTag>
          <LxTag size="default">Default</LxTag>
          <LxTag size="large">Large</LxTag>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.tagInteractions")}
        description={t("uiPreview.demos.tagInteractionsDesc")}
      >
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
              Clickable Tag
            </LxTag>
            <LxTag color="rose" prefix={<CircleDot className="h-2.5 w-2.5" />}>
              With Prefix
            </LxTag>
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
