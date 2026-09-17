import type { UpdateState } from "@shared/contracts/update"
import { useCallback, useEffect, useState } from "react"
import { updateApi } from "../api/updateApi"

// 会话级"忽略"记录：不持久化，应用重启后如仍未升级会再次提示。
let sessionDismissedVersion: string | null = null

export interface UpdateNotice {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  // 是否已完成过一次检查（用于区分"尚未检查"与"已是最新"）。
  hasChecked: boolean
  // 最近一次检查是否失败。
  failed: boolean
  isChecking: boolean
  isDismissed: boolean
  check: () => Promise<void>
  dismiss: () => void
}

/**
 * 订阅主进程更新状态：返回当前版本、可升级信息与手动检查/忽略操作。
 */
export const useUpdateNotice = (): UpdateNotice => {
  const [state, setState] = useState<UpdateState | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(sessionDismissedVersion)
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    let isCurrent = true
    void updateApi.getState().then((next) => {
      if (isCurrent) setState(next)
    })
    const unsubscribe = updateApi.onStateChanged((next) => {
      if (isCurrent) setState(next)
    })
    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [])

  const check = useCallback(async (): Promise<void> => {
    setIsChecking(true)
    try {
      setState(await updateApi.check())
    } finally {
      setIsChecking(false)
    }
  }, [])

  const dismiss = useCallback((): void => {
    if (!state?.latestVersion) return
    sessionDismissedVersion = state.latestVersion
    setDismissedVersion(state.latestVersion)
  }, [state?.latestVersion])

  const latestVersion = state?.latestVersion ?? null

  return {
    currentVersion: state?.currentVersion ?? "",
    latestVersion,
    hasUpdate: state?.hasUpdate ?? false,
    releaseUrl: state?.releaseUrl ?? null,
    hasChecked: Boolean(state?.checkedAt),
    failed: state?.failed ?? false,
    isChecking,
    isDismissed: latestVersion !== null && dismissedVersion === latestVersion,
    check,
    dismiss,
  }
}
