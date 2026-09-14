import type { AgentSessionSummary } from "@shared/contracts/agent"
import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { ChatHistoryPanel } from "@/features/agent"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例会话列表。
const createMockSessions = (t: I18nContextType["t"]): AgentSessionSummary[] => [
  {
    id: "sess_1",
    title: t("uiPreview.demos.mock.chatHistory.session1"),
    projectId: "proj_lx_agent",
    cwd: "/Users/dev/projects/lx-agent",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  {
    id: "sess_2",
    title: t("uiPreview.demos.mock.chatHistory.session2"),
    projectId: "proj_lx_agent",
    cwd: "/Users/dev/projects/lx-agent",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "sess_3",
    title: t("uiPreview.demos.mock.chatHistory.session3"),
    projectId: "proj_other",
    cwd: "/Users/dev/projects/other-project",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
]

const MOCK_PROJECTS = [
  { id: "proj_lx_agent", name: "lx-agent" },
  { id: "proj_other", name: "other-project" },
]

export const ChatHistoryDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const [sessions, setSessions] = useState<AgentSessionSummary[]>(() => createMockSessions(t))
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
              toast.success(t("uiPreview.demos.toast.sessionRestore", { id }))
            }}
            onDelete={(id) => {
              setSessions((prev) => prev.filter((s) => s.id !== id))
              toast.info(t("uiPreview.demos.toast.sessionDelete", { id }))
            }}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
