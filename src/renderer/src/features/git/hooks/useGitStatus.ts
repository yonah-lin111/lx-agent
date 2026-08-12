import type { GitStatus } from "@shared/contracts/git"
import { useEffect, useState } from "react"
import { gitApi } from "@/features/git/api/gitApi"

// 工作区变更属低频事件，轮询间隔 10s 足够感知；窗口重新聚焦时立即刷新。
const POLL_INTERVAL_MS = 10_000

/**
 * 轮询查询目录的 git 分支与工作区变更计数；目录缺失或非 git 仓库时返回 null。
 *
 * 目录变化时重置状态并重新拉取；卸载时清理定时器与焦点监听。
 */
export const useGitStatus = (directory: string | undefined): GitStatus | null => {
  const [status, setStatus] = useState<GitStatus | null>(null)

  useEffect(() => {
    if (!directory) {
      setStatus(null)
      return
    }

    let isCurrent = true
    let timer: number | null = null

    const load = (): void => {
      void gitApi.getStatus(directory).then((result) => {
        if (isCurrent) setStatus(result)
      })
    }

    load()
    timer = window.setInterval(load, POLL_INTERVAL_MS)
    window.addEventListener("focus", load)

    return () => {
      isCurrent = false
      if (timer !== null) window.clearInterval(timer)
      window.removeEventListener("focus", load)
    }
  }, [directory])

  return status
}
