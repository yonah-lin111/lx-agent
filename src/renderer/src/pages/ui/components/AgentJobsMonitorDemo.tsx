import type React from "react"
import { AgentJobsMonitorView } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

export const AgentJobsMonitorDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.jobsMonitorTitle")}
        description={t("uiPreview.demos.jobsMonitorDesc")}
      >
        <div className="h-[400px] w-full max-w-3xl overflow-hidden rounded-[6px] border border-white/10 bg-[#1e1e1e]">
          <AgentJobsMonitorView isExpanded={true} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
