import type { PermissionRequest, TodoList } from "@shared/contracts/agent"
import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { AgentContextUsagePill, AgentStatusBar, PermissionStatusButton, TodoStatusButton } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

const MOCK_TODOS: TodoList = [
  { content: "编写 Agent 状态栏组件 Demo", status: "in_progress" },
  { content: "编写 权限与待办按钮 单体预览", status: "completed" },
  { content: "完成端到端验证", status: "pending" },
]

const MOCK_PERMISSION: PermissionRequest = {
  requestId: "perm_req_1",
  sessionId: "sess_demo",
  toolName: "bash",
  args: { command: "npm test" },
  summary: "执行测试脚本",
  mode: "build",
}

export const AgentStatusBarDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const [pendingReq, setPendingReq] = useState<PermissionRequest | null>(MOCK_PERMISSION)

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentStatusBarTitle")}
        description={t("uiPreview.demos.agentStatusBarDesc")}
      >
        <div className="flex w-full max-w-2xl flex-col gap-4">
          <div className="rounded-[6px] border border-white/5 bg-[#1a1a1a] p-1">
            <AgentStatusBar
              projectPath="/Users/dev/projects/lx-agent"
              todos={MOCK_TODOS}
              pendingRequest={pendingReq}
              onPermissionRespond={(decision) => {
                toast.info(`权限响应: ${decision}`)
                setPendingReq(null)
              }}
              onOpenJobs={() => toast.info("点击打开长任务监控面板")}
            />
          </div>

          <div className="flex items-center gap-4 rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <span className="text-xs text-white/50">状态按钮单独展示：</span>
            <AgentContextUsagePill contextUsage={{ tokens: 68000, contextWindow: 200000 }} />
            <TodoStatusButton todos={MOCK_TODOS} />
            <PermissionStatusButton
              request={pendingReq}
              sandboxPolicy="workspace-write"
              onRespond={(decision) => {
                toast.info(`权限响应: ${decision}`)
                setPendingReq(null)
              }}
            />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
