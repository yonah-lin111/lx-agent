import type React from "react"
import { AgentCompactionSummary } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

const MOCK_SUMMARY = `
### 上下文压缩摘要
- **已保留的关键决策**：用户确认将所有 Agent 组件纳入 UI Preview 演示。
- **已完成事项**：完成了组件分析与国际化词条扩充。
- **当前状态**：正在编写各独立 Demo 页面。
`

export const AgentCompactionDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentCompactionTitle")}
        description={t("uiPreview.demos.agentCompactionDesc")}
      >
        <div className="flex w-full max-w-xl flex-col gap-4">
          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <AgentCompactionSummary
              summary={MOCK_SUMMARY}
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
