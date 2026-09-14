import type React from "react"
import { useMemo, useState } from "react"
import { AgentSubagentBlock, AgentSubagentPanel } from "@/features/agent"
import type { ChatBlock } from "@/features/agent/types"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 示例子代理任务调用。
const createMockSubagentCall = (t: I18nContextType["t"]): ToolCallBlock => {
  const description = t("uiPreview.demos.mock.subagent.description")
  const prompt = t("uiPreview.demos.mock.subagent.prompt")

  return {
    kind: "toolCall",
    toolCallId: "call_task_1",
    toolName: "task",
    args: {
      description,
      prompt,
      subagent_type: "explore",
    },
    subagent: {
      name: "explore",
      description,
      prompt,
      usage: { input: 360, output: 130, cacheRead: 0, cacheWrite: 0, totalTokens: 490 },
      steps: [
        {
          toolName: "glob",
          args: { pattern: "src/renderer/src/features/agent/components/*" },
          status: "done",
        },
        {
          toolName: "mcp_read_resource",
          args: { uri: "file://components" },
          status: "done",
        },
        {
          toolName: "web_search",
          args: { query: "lucide icons" },
          status: "done",
        },
      ],
      messages: [
        {
          role: "assistant",
          content: [{ type: "text", text: t("uiPreview.demos.mock.subagent.initMessage") }],
          provider: "anthropic",
          model: "claude-3-7-sonnet",
          usage: { input: 120, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 170 },
          stopReason: "stop",
          timestamp: Date.now() - 5000,
        },
        {
          role: "assistant",
          content: [{ type: "text", text: t("uiPreview.demos.mock.subagent.scanResult") }],
          provider: "anthropic",
          model: "claude-3-7-sonnet",
          usage: { input: 240, output: 80, cacheRead: 0, cacheWrite: 0, totalTokens: 320 },
          stopReason: "stop",
          timestamp: Date.now(),
        },
      ],
    },
    status: "done",
  }
}

export const AgentSubagentDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const mockSubagentCall = useMemo(() => createMockSubagentCall(t), [t])
  const [activePanelCall, setActivePanelCall] = useState<ToolCallBlock | null>(null)

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentSubagentTitle")}
        description={t("uiPreview.demos.agentSubagentDesc")}
      >
        <div className="flex w-full max-w-xl flex-col gap-3">
          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <AgentSubagentBlock
              toolCall={mockSubagentCall}
              onOpen={(call) => setActivePanelCall(call)}
            />
          </div>
        </div>
      </UiPreviewSection>

      {activePanelCall ? (
        <div className="relative h-[320px] w-full max-w-2xl overflow-hidden rounded-[6px] border border-white/10 bg-[#1e1e1e]">
          <AgentSubagentPanel toolCall={activePanelCall} onClose={() => setActivePanelCall(null)} />
        </div>
      ) : null}
    </div>
  )
}
