import { MCP_PRESETS } from "@shared/mcpPresets"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { execShellCommand } = vi.hoisted(() => ({ execShellCommand: vi.fn() }))

vi.mock("@/services/cliToolService", () => ({ execShellCommand }))

import {
  getMcpPresetStatus,
  installMcpPreset,
  probeMcpPresetBinary,
} from "@/services/mcpPresetService"

describe("mcpPresetService", () => {
  beforeEach(() => {
    execShellCommand.mockReset()
  })

  it("MCP_PRESETS 定义三个预设且元数据完整", () => {
    expect(MCP_PRESETS.map((preset) => preset.id)).toEqual([
      "context7",
      "codegraph",
      "codebase-memory-mcp",
    ])

    for (const preset of MCP_PRESETS) {
      expect(preset.command.length).toBeGreaterThan(0)
      expect(preset.probeBin).toBe(preset.command[0])
      expect(preset.homepage).toMatch(/^https:\/\//)
      if (preset.installKind === "npm-global") {
        expect(preset.installCommand).toBeTruthy()
      } else {
        expect(preset.installCommand).toBeUndefined()
      }
    }
  })

  it("probeMcpPresetBinary 对绝对路径直接校验存在性", async () => {
    expect(await probeMcpPresetBinary(process.execPath)).toBe(process.execPath)
    expect(await probeMcpPresetBinary("/nonexistent/bin/lx-absent-bin")).toBeNull()
    expect(await probeMcpPresetBinary("")).toBeNull()
    expect(execShellCommand).not.toHaveBeenCalled()
  })

  it("probeMcpPresetBinary 通过 which/where 解析并取首行", async () => {
    execShellCommand.mockResolvedValue({
      stdout: "  /usr/local/bin/codegraph  \n/other/path/codegraph\n",
      stderr: "",
      exitCode: 0,
    })

    expect(await probeMcpPresetBinary("codegraph")).toBe("/usr/local/bin/codegraph")
    expect(execShellCommand).toHaveBeenCalledWith(
      expect.stringMatching(/^(which|where) codegraph$/),
      5_000,
    )
  })

  it("probeMcpPresetBinary 在命令失败时返回 null", async () => {
    execShellCommand.mockResolvedValue({ stdout: "", stderr: "not found", exitCode: 1 })

    expect(await probeMcpPresetBinary("codegraph")).toBeNull()
  })

  it("getMcpPresetStatus 汇总全部预设的探测结果", async () => {
    execShellCommand.mockResolvedValue({
      stdout: "/usr/local/bin/tool\n",
      stderr: "",
      exitCode: 0,
    })

    const statuses = await getMcpPresetStatus()

    expect(statuses).toHaveLength(MCP_PRESETS.length)
    for (const status of statuses) {
      expect(status.installed).toBe(true)
      expect(status.detectedPath).toBe("/usr/local/bin/tool")
    }
  })

  it("installMcpPreset 拒绝未知预设且不执行命令", async () => {
    const result = await installMcpPreset("unknown" as never)

    expect(result.success).toBe(false)
    expect(execShellCommand).not.toHaveBeenCalled()
  })

  it("installMcpPreset 对 npx 类预设不执行安装", async () => {
    const result = await installMcpPreset("context7")

    expect(result.success).toBe(false)
    expect(execShellCommand).not.toHaveBeenCalled()
  })

  it("installMcpPreset 执行全局安装命令并返回结果", async () => {
    execShellCommand.mockResolvedValue({ stdout: "added 1 package", stderr: "", exitCode: 0 })

    const result = await installMcpPreset("codegraph")

    expect(result.success).toBe(true)
    expect(execShellCommand).toHaveBeenCalledWith(
      "npm i -g @colbymchenry/codegraph@latest",
      180_000,
    )
  })

  it("installMcpPreset 失败时返回 stderr 末几行", async () => {
    execShellCommand.mockResolvedValue({
      stdout: "",
      stderr: "line1\nline2\nnpm ERR! failed",
      exitCode: 1,
    })

    const result = await installMcpPreset("codebase-memory-mcp")

    expect(result.success).toBe(false)
    expect(result.detail).toContain("npm ERR! failed")
  })
})
