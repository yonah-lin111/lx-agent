import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { agentTabStore } from "@/features/agent"
import { notificationApi } from "@/features/notification/api/notificationApi"
import { useOpenClawOfficeStore } from "@/features/openclaw"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

/**
 * 订阅系统通知点击：main 侧聚焦窗口后推送跳转目标。
 * agent → 切换右侧栏标签页；openclaw → 跳转办公区并选中对应员工。
 * 目标已不存在（tab 关闭 / 实例下线）时由 store 侧自守卫静默忽略。
 */
export const useNotificationClickRouter = (): void => {
  const navigate = useNavigate()

  useEffect(() => {
    return notificationApi.onClick((payload) => {
      if (payload.source === "agent") {
        // tab 已关闭时 switchTab 内部自守卫，直接转发。
        agentTabStore.switchTab(payload.tabId)
        return
      }
      useOpenClawOfficeStore.getState().selectOffice(payload.instanceId, payload.agentId)
      void navigate(PAGE_ROUTES.openclaw)
    })
  }, [navigate])
}
