import type { AgentSessionSummary } from "@shared/contracts/agent"
import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { ChatHistoryPanel } from "@/features/agent/components/ChatHistoryPanel"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

const MOCK_SESSIONS: AgentSessionSummary[] = [
  {
    id: "sess_1",
    title: "重构 UI Preview 分区并补充 Agent 完整组件演示",
    projectId: "proj_lx_agent",
    createdAt: Date.now() - 1000 * 60 * 30,
    updatedAt: Date.now() - 1000 * 60 * 5,
    messageCount: 18,
  },
  {
    id: "sess_2",
    title: "优化 LSP 工具调用与多语言国际化配置",
    projectId: "proj_lx_agent",
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    updatedAt: Date.now() - 1000 * 60 * 60,
    messageCount: 8,
  },
  {
    id: "sess_3",
    title: "探索 Subagent Panel 抽屉展示与步骤聚合",
    projectId: "proj_other",
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    updatedAt: Date.now() - 1000 * 60 * 60 * 20,
    messageCount: 24,
  },
]

const MOCK_PROJECTS = [
  { id: "proj_lx_agent", name: "lx-agent" },
  { id: "proj_other", name: "other-project" },
]

export const ChatHistoryDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const [sessions, setSessions] = useState<AgentSessionSummary[]>(MOCK_SESSIONS)
  const [currentId, setCurrentId] = useState<string | null>("sess_1")

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.chatHistoryTitle")}
        description={t("uiPreview.demos.chatHistoryDesc")}
      >
        <div className="relative h-[480px] w-full max-w-2xl overflow-hidden rounded-[6px] border border-white/10 bg-[#1e1e1e]">
          <ChatHistoryPanel
            sessions={sessions}
            currentSessionId={currentId}
            currentProjectId="proj_lx_agent"
            projects={MOCK_PROJECTS}
            onRestore={(id) => {
              setCurrentId(id)
              toast.success(`恢复会话: ${id}`)
            }}
            onDelete={(id) => {
              setSessions((prev) => prev.filter((s) => s.id !== id))
              toast.info(`删除会话: ${id}`)
            }}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
