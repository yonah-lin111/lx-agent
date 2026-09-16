import { existsSync } from "node:fs"
import {
  MCP_PRESETS,
  type McpPresetId,
  type McpPresetInstallResult,
  type McpPresetStatusItem,
} from "@shared/mcpPresets"
import { execShellCommand } from "@/services/cliToolService"

// 全局安装超时（npm i -g 可能拉取较大包）。
const INSTALL_TIMEOUT_MS = 180_000

// 二进制探测超时。
const PROBE_TIMEOUT_MS = 5_000

/**
 * 探测二进制路径：绝对路径校验存在性，否则用 which/where 查找。
 */
export const probeMcpPresetBinary = async (bin: string): Promise<string | null> => {
  if (!bin) return null
  if (bin.includes("/") || bin.includes("\\")) {
    return existsSync(bin) ? bin : null
  }

  const whichCmd = process.platform === "win32" ? "where" : "which"
  const result = await execShellCommand(`${whichCmd} ${bin}`, PROBE_TIMEOUT_MS)
  if (result.exitCode !== 0) return null

  const firstLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return firstLine ?? null
}

/**
 * 探测全部预设的安装状态。
 */
export const getMcpPresetStatus = async (): Promise<McpPresetStatusItem[]> => {
  return Promise.all(
    MCP_PRESETS.map(async (preset): Promise<McpPresetStatusItem> => {
      const detectedPath = await probeMcpPresetBinary(preset.probeBin)
      return {
        id: preset.id,
        installed: detectedPath !== null,
        detectedPath,
      }
    }),
  )
}

/**
 * 安装指定预设（仅 npm-global 类提供安装命令）。
 */
export const installMcpPreset = async (id: McpPresetId): Promise<McpPresetInstallResult> => {
  const preset = MCP_PRESETS.find((item) => item.id === id)
  if (!preset) {
    return { success: false, detail: `Unknown MCP preset: ${id}` }
  }
  if (!preset.installCommand) {
    return { success: false, detail: `${preset.id} does not require installation` }
  }

  const result = await execShellCommand(preset.installCommand, INSTALL_TIMEOUT_MS)
  if (result.exitCode === 0) {
    return { success: true, detail: result.stdout.trim() }
  }

  const rawError = result.stderr.trim() || result.stdout.trim() || `exit code: ${result.exitCode}`
  return { success: false, detail: rawError.split("\n").filter(Boolean).slice(-5).join("\n") }
}
