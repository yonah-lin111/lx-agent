import { Star } from "lucide-react"
import type React from "react"

import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxIconButton 组件。
 */
export const LxIconButtonDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.presets")}
        description={t("uiPreview.demos.presetsDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LxIconButton
            preset="add"
            aria-label={t("common.add")}
            title={{ content: t("common.add"), placement: "bottom" }}
          />
          <LxIconButton
            preset="close"
            aria-label={t("common.close")}
            title={{ content: t("common.close"), placement: "bottom" }}
          />
          <LxIconButton
            preset="save"
            aria-label={t("common.save")}
            title={{ content: t("common.save"), placement: "bottom" }}
          />
          <LxIconButton
            preset="confirm"
            aria-label={t("common.confirm")}
            title={{ content: t("common.confirm"), placement: "bottom" }}
          />
          <LxIconButton
            preset="delete"
            aria-label={t("common.delete")}
            title={{ content: t("common.delete"), placement: "bottom" }}
          />
          <LxIconButton
            preset="edit"
            aria-label={t("common.edit")}
            title={{ content: t("common.edit"), placement: "bottom" }}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.sizesAndShapes")}
        description={t("uiPreview.demos.sizesAndShapesDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LxIconButton
            size="small"
            aria-label="small 尺寸"
            title={{ content: "small", placement: "bottom" }}
          />
          <LxIconButton
            size="medium"
            aria-label="medium 尺寸"
            title={{ content: "medium", placement: "bottom" }}
          />
          <LxIconButton
            size="large"
            aria-label="large 尺寸"
            title={{ content: "large", placement: "bottom" }}
          />
          <LxIconButton
            shape="circle"
            preset="add"
            aria-label="圆形添加"
            title={{ content: "circle + add", placement: "bottom" }}
          />
          <LxIconButton
            shape="circle"
            preset="delete"
            aria-label="圆形删除"
            title={{ content: "circle + delete", placement: "bottom" }}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.states")}
        description={t("uiPreview.demos.statesDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LxIconButton preset="add" disabled aria-label="禁用添加" />
          <LxIconButton
            highlighted
            aria-label={t("common.status")}
            title={{ content: "highlighted", placement: "bottom" }}
          />
          <LxIconButton aria-label="Star" title={{ content: "Star", placement: "bottom" }}>
            <Star className="h-4 w-4" />
          </LxIconButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
