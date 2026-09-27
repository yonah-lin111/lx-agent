import type React from "react"

import { notificationApi } from "@/features/notification"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览系统通知的真实投递与点击聚焦行为。
 */
export const NotificationDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <UiPreviewSection
      title={t("uiPreview.demos.notificationTitle")}
      description={t("uiPreview.demos.notificationDesc")}
    >
      <div className="flex flex-wrap gap-2">
        <UiActionButton onClick={() => notificationApi.showDemo()}>
          {t("uiPreview.demos.notificationSend")}
        </UiActionButton>
      </div>
    </UiPreviewSection>
  )
}
