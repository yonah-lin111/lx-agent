import { ChevronDown, FileText, Folder, FolderOpen } from "lucide-react"
import type React from "react"

import { LxNavItem } from "@/components/ui/LxNavItem"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxNavItem 组件。
 */
export const LxNavItemDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.navItemLevels")}
        description={t("uiPreview.demos.navItemLevelsDesc")}
      >
        <div className="flex max-w-80 flex-col gap-1">
          <LxNavItem
            level={1}
            label={t("uiPreview.demos.mock.navItem.root")}
            prefix={<FolderOpen className="h-3.5 w-3.5 shrink-0" />}
            suffix={<ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          />
          <LxNavItem
            level={2}
            depth={1}
            label={t("uiPreview.demos.mock.navItem.group")}
            prefix={<Folder className="h-3.5 w-3.5 shrink-0" />}
          />
          <LxNavItem
            level={3}
            depth={2}
            aria-current="page"
            className="bg-white/5 text-white"
            label={t("uiPreview.demos.mock.navItem.leaf")}
            prefix={<FileText className="h-3.5 w-3.5 shrink-0" />}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.navItemSizes")}
        description={t("uiPreview.demos.navItemSizesDesc")}
      >
        <div className="flex max-w-80 flex-col gap-1">
          <LxNavItem
            size="small"
            label={`${t("uiPreview.demos.mock.navItem.leaf")} (small)`}
            prefix={<FileText className="h-3.5 w-3.5 shrink-0" />}
          />
          <LxNavItem
            size="medium"
            label={`${t("uiPreview.demos.mock.navItem.leaf")} (medium)`}
            prefix={<FileText className="h-3.5 w-3.5 shrink-0" />}
          />
          <LxNavItem
            size="large"
            label={`${t("uiPreview.demos.mock.navItem.leaf")} (large)`}
            prefix={<FileText className="h-3.5 w-3.5 shrink-0" />}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.navItemTruncate")}
        description={t("uiPreview.demos.navItemTruncateDesc")}
      >
        <div className="w-44">
          <LxNavItem
            label={t("uiPreview.demos.mock.navItem.longLabel")}
            prefix={<Folder className="h-3.5 w-3.5 shrink-0" />}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
