import type { GitStatus, GitWorktreeEntry } from "@shared/contracts/git"
import { useEffect, useRef, useState } from "react"
import { gitApi } from "@/features/git/api/gitApi"

// 工作区与分支属低频事件，轮询间隔 10s 足够感知；窗口重新聚焦时立即刷新。
const POLL_INTERVAL_MS = 10_000

/**
 * 加载目录所在仓库的工作区列表与当前分支，供 /gitWorktree 二级面板与 @ 搜索上下文解析共用。
 *
 * projectPath 变化时重新拉取；目录缺失或非 git 仓库时列表为 null。
 */
export const useGitWorktrees = (projectPath: string | undefined) => {
  const [worktrees, setWorktrees] = useState<GitWorktreeEntry[] | null>(null)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const requestRef = useRef(0)
  const projectPathRef = useRef(projectPath)

  useEffect(() => {
    projectPathRef.current = projectPath
  }, [projectPath])

  // 主动重拉工作区（打开 /gitWorktree 二级面板时若尚未加载则调用）。
  const reload = (): void => {
    const currentPath = projectPathRef.current
    if (!currentPath) return
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    void Promise.all([gitApi.listWorktrees(currentPath), gitApi.getStatus(currentPath)]).then(
      ([worktreeList, gitStatus]) => {
        if (requestRef.current !== requestId) return
        setWorktrees(worktreeList)
        setStatus(gitStatus)
      },
    )
  }

  useEffect(() => {
    if (!projectPath) {
      setWorktrees(null)
      setStatus(null)
      return
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId
    let isCurrent = true

    const load = (): void => {
      void Promise.all([gitApi.listWorktrees(projectPath), gitApi.getStatus(projectPath)]).then(
        ([worktreeList, gitStatus]) => {
          if (!isCurrent || requestRef.current !== requestId) return
          setWorktrees(worktreeList)
          setStatus(gitStatus)
        },
      )
    }

    load()
    const timer = window.setInterval(load, POLL_INTERVAL_MS)
    window.addEventListener("focus", load)
    return () => {
      isCurrent = false
      window.clearInterval(timer)
      window.removeEventListener("focus", load)
    }
  }, [projectPath])

  // 当前项目分支（默认工作区展示名）。默认工作区 = 项目路径，无 git 上下文时为 null。
  const projectBranch = status?.branch ?? null

  return { worktrees, status, projectBranch, reload }
}
