import type { GitHubStarsState } from "@shared/contracts/github"
import { useEffect, useState } from "react"
import { EMPTY_GITHUB_STARS_STATE, githubApi } from "../api/githubApi"

/**
 * 读取主进程缓存后的仓库星标状态；请求失败静默降级为无星数。
 */
export const useGitHubStars = (): GitHubStarsState => {
  const [state, setState] = useState<GitHubStarsState>(EMPTY_GITHUB_STARS_STATE)

  useEffect(() => {
    let isCurrent = true
    void githubApi
      .getStars()
      .then((next) => {
        if (isCurrent) setState(next)
      })
      .catch(() => {
        // IPC 异常时保持初始状态，链接入口不受影响。
      })
    return () => {
      isCurrent = false
    }
  }, [])

  return state
}
