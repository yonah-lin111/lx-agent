import type React from "react"
import { useState } from "react"
import { AgentSubagentBlock } from "@/features/agent/components/AgentSubagentBlock"
import { AgentSubagentPanel } from "@/features/agent/components/AgentSubagentPanel"
import type { ChatBlock } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

const MOCK_SUBAGENT_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call_task_1",
  toolName: "task",
  args: {
    description: "检索并分析项目中的所有 Agent 相关组件",
    prompt: "请扫描 src/renderer/src/features/agent/components 目录下的所有文件并返回汇总",
    subagent_type: "explore",
  },
  subagent: {
    name: "explore",
    description: "检索并分析项目中的所有 Agent 相关组件",
    steps: [
      {
        id: "step_1",
        toolName: "glob",
        args: { pattern: "src/renderer/src/features/agent/components/*" },
        state: "completed",
      },
      {
        id: "step_2",
        toolName: "mcp_read_resource",
        args: { uri: "file://components" },
        state: "completed",
      },
      {
        id: "step_3",
        toolName: "web_search",
        args: { query: "lucide icons" },
        state: "completed",
      },
    ],
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text: "子代理初始化完毕，开始执行探索任务..." }],
        provider: "anthropic",
        model: "claude-3-7-sonnet",
        usage: { input: 120, output: 50, cacheRead: 0, totalTokens: 170 },
        stopReason: "stop",
        timestamp: Date.now() - 5000,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "已扫描到 24 个组件文件，并完成数据依赖关系梳理。" }],
        provider: "anthropic",
        model: "claude-3-7-sonnet",
        usage: { input: 240, output: 80, cacheRead: 0, totalTokens: 320 },
        stopReason: "stop",
        timestamp: Date.now(),
      },
    ],
  },
  status: "done",
}

export const AgentSubagentDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
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
              toolCall={MOCK_SUBAGENT_CALL}
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
