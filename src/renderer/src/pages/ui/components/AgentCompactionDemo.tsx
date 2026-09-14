import type React from "react"
import { AgentCompactionSummary } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

export const AgentCompactionDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const mockSummary = t("uiPreview.demos.mock.compaction.summary")

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentCompactionTitle")}
        description={t("uiPreview.demos.agentCompactionDesc")}
      >
        <div className="flex w-full max-w-xl flex-col gap-4">
          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <AgentCompactionSummary
              summary={mockSummary}
              isManual={false}
              modelName="claude-3-7-sonnet"
              usage={{ input: 48500, output: 620 }}
              summaryTokens={180}
            />
          </div>

          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <AgentCompactionSummary
              summary=""
              isLoading={true}
              isManual={true}
              modelName="claude-3-7-sonnet"
            />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
