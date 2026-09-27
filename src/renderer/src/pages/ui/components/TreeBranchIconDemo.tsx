import { Folder } from "lucide-react"
import type React from "react"

import { LxNavItem } from "@/components/ui/LxNavItem"
import { TreeBranchIcon } from "@/components/ui/TreeBranchIcon"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 演示层级路径（与语言无关的路径标识）。
const TREE_ROWS: Array<{ label: string; depth: number }> = [
  { label: "src", depth: 1 },
  { label: "renderer", depth: 2 },
  { label: "pages", depth: 3 },
  { label: "ui", depth: 4 },
  { label: "index.tsx", depth: 5 },
]

/**
 * 预览 TreeBranchIcon 组件。
 */
export const TreeBranchIconDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.treeBranchTitle")}
        description={t("uiPreview.demos.treeBranchTitleDesc")}
      >
        <div className="flex max-w-80 flex-col gap-1">
          <LxNavItem
            level={1}
            label="lx-agent"
            prefix={<Folder className="h-3.5 w-3.5 shrink-0" />}
          />
          {TREE_ROWS.map((row) => (
            <LxNavItem
              key={row.label}
              level={3}
              depth={row.depth}
              label={row.label}
              prefix={<TreeBranchIcon />}
            />
          ))}
        </div>
      </UiPreviewSection>
    </div>
  )
}
