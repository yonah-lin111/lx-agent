import type React from "react"
import { AgentLspBlock } from "@/features/agent/components/AgentLspBlock"
import type { ChatBlock, LspToolDetails } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

const MOCK_LSP_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "call_lsp_1",
    toolName: "lsp",
    args: {
      operation: "goToDefinition",
      filePath: "/src/renderer/src/features/agent/components/AgentLspBlock.tsx",
      line: 42,
      character: 15,
    },
    status: "done",
  },
]

const MOCK_LSP_DETAILS: LspToolDetails[] = [
  {
    operation: "goToDefinition",
    filePath: "/src/renderer/src/features/agent/components/AgentLspBlock.tsx",
    line: 42,
    character: 15,
    results: [
      {
        filePath: "/src/renderer/src/features/agent/types.ts",
        line: 18,
        character: 4,
        label: "LspToolDetails interface",
      },
    ],
  },
]

export const AgentLspDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentLspTitle")}
        description={t("uiPreview.demos.agentLspDesc")}
      >
        <div className="w-full max-w-xl rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
          <AgentLspBlock toolCalls={MOCK_LSP_CALLS} details={MOCK_LSP_DETAILS} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
