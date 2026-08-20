import type React from "react"
import { useSearchParams } from "react-router-dom"

import { UI_SECTIONS } from "@/features/ui-preview"
import { useTranslation } from "@/i18n"
import { AgentCompactionDemo } from "@/pages/ui/components/AgentCompactionDemo"
import { AgentInputDemo } from "@/pages/ui/components/AgentInputDemo"
import { AgentJobsMonitorDemo } from "@/pages/ui/components/AgentJobsMonitorDemo"
import { AgentLspDemo } from "@/pages/ui/components/AgentLspDemo"
import { AgentMcpCallDemo } from "@/pages/ui/components/AgentMcpCallDemo"
import { AgentMessageItemDemo } from "@/pages/ui/components/AgentMessageItemDemo"
import { AgentMessageListDemo } from "@/pages/ui/components/AgentMessageListDemo"
import { AgentMessageListSkeletonDemo } from "@/pages/ui/components/AgentMessageListSkeletonDemo"
import { AgentQuestionDemo } from "@/pages/ui/components/AgentQuestionDemo"
import { AgentSkillCallDemo } from "@/pages/ui/components/AgentSkillCallDemo"
import { AgentStatusBarDemo } from "@/pages/ui/components/AgentStatusBarDemo"
import { AgentSubagentDemo } from "@/pages/ui/components/AgentSubagentDemo"
import { AgentThinkingDemo } from "@/pages/ui/components/AgentThinkingDemo"
import { AgentTodoCallDemo } from "@/pages/ui/components/AgentTodoCallDemo"
import { AgentToolCallDemo } from "@/pages/ui/components/AgentToolCallDemo"
import { AgentWebSearchDemo } from "@/pages/ui/components/AgentWebSearchDemo"
import { ChatHistoryDemo } from "@/pages/ui/components/ChatHistoryDemo"
import { LxCheckboxDemo } from "@/pages/ui/components/LxCheckboxDemo"
import { LxIconButtonDemo } from "@/pages/ui/components/LxIconButtonDemo"
import { LxInputDemo } from "@/pages/ui/components/LxInputDemo"
import { LxLoadingOverlayDemo } from "@/pages/ui/components/LxLoadingOverlayDemo"
import { LxMarkdownDemo } from "@/pages/ui/components/LxMarkdownDemo"
import { LxMenuDemo } from "@/pages/ui/components/LxMenuDemo"
import { LxModalDemo } from "@/pages/ui/components/LxModalDemo"
import { LxRadioDemo } from "@/pages/ui/components/LxRadioDemo"
import { LxSelectDemo } from "@/pages/ui/components/LxSelectDemo"
import { LxTagDemo } from "@/pages/ui/components/LxTagDemo"
import { LxToastDemo } from "@/pages/ui/components/LxToastDemo"
import { LxTooltipDemo } from "@/pages/ui/components/LxTooltipDemo"
import { SuggestedQuestionsDemo } from "@/pages/ui/components/SuggestedQuestionsDemo"

/**
 * 渲染 UI 组件预览页面。
 */
export const UiPreviewPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? UI_SECTIONS[0].id
  const activeUiSection =
    UI_SECTIONS.find((section) => section.id === activeSection) ?? UI_SECTIONS[0]

  return (
    <section className="ui-preview-page-container flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <div className="ui-preview-page-header flex shrink-0 items-center justify-between gap-3 border-b border-white/5 p-3">
        <p className="ui-preview-page-description text-xs text-white/45">
          {t(activeUiSection.descriptionKey)}
        </p>
      </div>
      <div className="ui-preview-page-content custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        {activeSection === "icon-button" ? <LxIconButtonDemo /> : null}
        {activeSection === "checkbox" ? <LxCheckboxDemo /> : null}
        {activeSection === "input" ? <LxInputDemo /> : null}
        {activeSection === "loading-overlay" ? <LxLoadingOverlayDemo /> : null}
        {activeSection === "markdown" ? <LxMarkdownDemo /> : null}
        {activeSection === "menu" ? <LxMenuDemo /> : null}
        {activeSection === "modal" ? <LxModalDemo /> : null}
        {activeSection === "radio" ? <LxRadioDemo /> : null}
        {activeSection === "select" ? <LxSelectDemo /> : null}
        {activeSection === "tag" ? <LxTagDemo /> : null}
        {activeSection === "toast" ? <LxToastDemo /> : null}
        {activeSection === "tooltip" ? <LxTooltipDemo /> : null}
        {activeSection === "thinking" ? <AgentThinkingDemo /> : null}
        {activeSection === "tool-call" ? <AgentToolCallDemo /> : null}
        {activeSection === "todo-call" ? <AgentTodoCallDemo /> : null}
        {activeSection === "question-block" ? <AgentQuestionDemo /> : null}
        {activeSection === "lsp-block" ? <AgentLspDemo /> : null}
        {activeSection === "subagent-block" ? <AgentSubagentDemo /> : null}
        {activeSection === "compaction-summary" ? <AgentCompactionDemo /> : null}
        {activeSection === "suggested-questions" ? <SuggestedQuestionsDemo /> : null}
        {activeSection === "mcp-call" ? <AgentMcpCallDemo /> : null}
        {activeSection === "skill-call" ? <AgentSkillCallDemo /> : null}
        {activeSection === "web-search" ? <AgentWebSearchDemo /> : null}
        {activeSection === "status-bar" ? <AgentStatusBarDemo /> : null}
        {activeSection === "input" ? <AgentInputDemo /> : null}
        {activeSection === "jobs-monitor" ? <AgentJobsMonitorDemo /> : null}
        {activeSection === "chat-history" ? <ChatHistoryDemo /> : null}
        {activeSection === "subagent-panel" ? <AgentSubagentDemo /> : null}
        {activeSection === "message-item" ? <AgentMessageItemDemo /> : null}
        {activeSection === "message-list" ? <AgentMessageListDemo /> : null}
        {activeSection === "skeleton" ? <AgentMessageListSkeletonDemo /> : null}
      </div>
    </section>
  )
}
