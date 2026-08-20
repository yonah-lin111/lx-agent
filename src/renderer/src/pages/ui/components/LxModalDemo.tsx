import type React from "react"
import { useState } from "react"

import { LxModal } from "@/components/ui/LxModal"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxModal 组件。
 */
export const LxModalDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.modalContainer")}
        description={t("uiPreview.demos.modalContainerDesc")}
      >
        <UiActionButton onClick={() => setIsOpen(true)}>
          {t("uiPreview.demos.openModal")}
        </UiActionButton>
        <LxModal
          isOpen={isOpen}
          title={t("uiPreview.demos.exampleModal")}
          onClose={() => setIsOpen(false)}
        >
          <p className="text-xs leading-relaxed text-white/70">
            {t("uiPreview.demos.modalContent")}
          </p>
          <div className="mt-3 flex justify-end">
            <UiActionButton onClick={() => setIsOpen(false)}>
              {t("uiPreview.demos.gotIt")}
            </UiActionButton>
          </div>
        </LxModal>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.confirmModal")}
        description={t("uiPreview.demos.confirmModalDesc")}
      >
        <UiActionButton onClick={() => setIsConfirmOpen(true)}>
          {t("uiPreview.demos.openConfirmModal")}
        </UiActionButton>
        <LxModal
          isOpen={isConfirmOpen}
          title={t("uiPreview.demos.deleteProjectTitle")}
          onClose={() => setIsConfirmOpen(false)}
        >
          <p className="text-xs leading-relaxed text-white/70">
            {t("uiPreview.demos.deleteProjectContent")}
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <UiActionButton onClick={() => setIsConfirmOpen(false)}>
              {t("common.cancel")}
            </UiActionButton>
            <button
              type="button"
              className="flex h-7 items-center gap-1.5 rounded-[6px] border border-rose-500/20 bg-rose-500/10 px-2.5 text-xs font-medium text-rose-300 transition-colors hover:border-rose-500/40 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
              onClick={() => setIsConfirmOpen(false)}
            >
              {t("common.confirmDelete")}
            </button>
          </div>
        </LxModal>
      </UiPreviewSection>
    </div>
  )
}
