import type { LspInstallResult, LspServerStatusItem } from "@shared/contracts/agent"
import { useCallback, useEffect, useMemo, useState } from "react"
import { agentApi } from "../api/agentApi"

// LSP 状态汇总（状态栏指示聚合）。
export interface LspStatusSummary {
  total: number
  installed: number
  missing: number
  names: string[]
  installedNames: string[]
  missingNames: string[]
}

/**
 * 查询各 LSP server 包安装状态；提供一键安装缺失包（npm install -g）并刷新。
 * 挂载时拉取快照；安装完成后主动 refresh，无事件推送（安装由用户主动触发）。
 */
export const useLspStatus = (): {
  packages: LspServerStatusItem[]
  summary: LspStatusSummary
  isLoading: boolean
  isInstalling: boolean
  lastResult: LspInstallResult | null
  refresh: () => Promise<void>
  installMissing: () => Promise<LspInstallResult | null>
} => {
  const [packages, setPackages] = useState<LspServerStatusItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isInstalling, setIsInstalling] = useState(false)
  const [lastResult, setLastResult] = useState<LspInstallResult | null>(null)

  const refresh = useCallback(async () => {
    try {
      setPackages(await agentApi.getLspStatus())
    } catch {
      // 查询失败保持现状，状态栏不因单次失败抖动。
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const installMissing = useCallback(async () => {
    setIsInstalling(true)
    try {
      const result = await agentApi.installLspServers()
      setLastResult(result)
      await refresh()
      return result
    } catch {
      return null
    } finally {
      setIsInstalling(false)
    }
  }, [refresh])

  const summary = useMemo<LspStatusSummary>(() => {
    const installedNames = packages.filter((p) => p.installed).map((p) => p.packageName)
    const missingNames = packages.filter((p) => !p.installed).map((p) => p.packageName)
    return {
      total: packages.length,
      installed: installedNames.length,
      missing: missingNames.length,
      names: packages.map((p) => p.packageName),
      installedNames,
      missingNames,
    }
  }, [packages])

  return { packages, summary, isLoading, isInstalling, lastResult, refresh, installMissing }
}
