import type { PermissionRequest } from "@shared/contracts/agent"
import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { AgentContextUsagePill, AgentStatusBar, PermissionStatusButton } from "@/features/agent"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例权限请求。
const createMockPermission = (t: I18nContextType["t"]): PermissionRequest => ({
  requestId: "perm_req_1",
  sessionId: "sess_demo",
  toolName: "bash",
  args: { command: "npm test" },
  summary: t("uiPreview.demos.mock.statusBar.permissionSummary"),
  mode: "default",
})

export const AgentStatusBarDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const [pendingReq, setPendingReq] = useState<PermissionRequest | null>(() =>
    createMockPermission(t),
  )

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
              pendingRequest={pendingReq}
              onPermissionRespond={(decision) => {
                toast.info(t("uiPreview.demos.toast.permissionResponse", { decision }))
                setPendingReq(null)
              }}
              onOpenJobs={() => toast.info(t("uiPreview.demos.toast.openJobs"))}
            />
          </div>

          <div className="flex items-center gap-4 rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
            <span className="text-xs text-white/50">
              {t("uiPreview.demos.mock.statusBar.statusButtonsLabel")}
            </span>
            <AgentContextUsagePill contextUsage={{ tokens: 68000, contextWindow: 200000 }} />
            <PermissionStatusButton
              request={pendingReq}
              sandboxPolicy="workspace-write"
              onRespond={(decision) => {
                toast.info(t("uiPreview.demos.toast.permissionResponse", { decision }))
                setPendingReq(null)
              }}
            />
          </div>
        </div>
      </UiPreviewSection>
    </div>
  )
}
