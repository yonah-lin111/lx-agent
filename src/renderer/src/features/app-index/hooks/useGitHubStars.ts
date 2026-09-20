import type { GitHubStarsInfo } from "@shared/contracts/github"
import { useEffect, useState } from "react"
import { githubApi } from "@/features/app-index/api/githubApi"

/**
 * 进入 app-index 时读取一次仓库星标状态；请求失败静默降级为无星数。
 */
export const useGitHubStars = (): GitHubStarsInfo => {
  const [state, setState] = useState<GitHubStarsInfo>({ stars: null })

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
