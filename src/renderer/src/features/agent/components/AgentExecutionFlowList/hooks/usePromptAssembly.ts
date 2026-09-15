import type { PromptAssembly } from "@shared/contracts/agent"
import { useCallback, useEffect, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"

/**
 * 拉取完整系统提示词装配。
 */
export const usePromptAssembly = (
  sessionId?: string,
  cwd?: string,
): { promptAssembly: PromptAssembly | null } => {
  const [promptAssembly, setPromptAssembly] = useState<PromptAssembly | null>(null)

  // 获取完整系统提示词装配
  const fetchPromptAssembly = useCallback(async () => {
    try {
      const assembly = await agentApi.getPromptAssembly(sessionId, cwd)
      setPromptAssembly(assembly)
    } catch {
      setPromptAssembly(null)
    }
  }, [sessionId, cwd])

  // 挂载时获取系统提示词装配
  useEffect(() => {
    void fetchPromptAssembly()
  }, [fetchPromptAssembly])

  return { promptAssembly }
}
