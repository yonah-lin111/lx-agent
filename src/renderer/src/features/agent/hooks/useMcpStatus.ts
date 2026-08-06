import type { AgentEvent, McpServerStatusItem } from "@shared/contracts/agent"
import { useEffect, useMemo, useState } from "react"
import { agentApi } from "../api/agentApi"

// MCP 状态汇总（供状态 icon 聚合展示）。
export interface McpStatusSummary {
  total: number
  connected: number
  failed: number
  disabled: number
  names: string[]
  failedNames: string[]
  disabledNames: string[]
}

/**
 * 订阅全部 MCP server 连接状态：挂载时拉取快照，后续依赖 main 进程
 * 推送的 mcp_status_changed 事件刷新（覆盖启动异步连接完成 / 运行中断连）。
 */
export const useMcpStatus = (): {
  servers: McpServerStatusItem[]
  isLoading: boolean
  summary: McpStatusSummary
} => {
  const [servers, setServers] = useState<McpServerStatusItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    void agentApi
      .getMcpStatus()
      .then((next) => {
        if (!mounted) return
        setServers(next)
        setIsLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setIsLoading(false)
      })
    const unsubscribe = agentApi.onEvent((event: AgentEvent) => {
      if (event.type !== "mcp_status_changed") return
      setServers(event.servers)
      setIsLoading(false)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const summary = useMemo<McpStatusSummary>(() => {
    const names = servers.map((server) => server.name)
    const failedNames: string[] = []
    const disabledNames: string[] = []
    let connected = 0
    for (const server of servers) {
      if (server.status === "connected") connected++
      else if (server.status === "failed") failedNames.push(server.name)
      else disabledNames.push(server.name)
    }
    return {
      total: servers.length,
      connected,
      failed: failedNames.length,
      disabled: disabledNames.length,
      names,
      failedNames,
      disabledNames,
    }
  }, [servers])

  return { servers, isLoading, summary }
}
