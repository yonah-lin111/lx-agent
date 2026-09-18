import { describe, expect, it, vi } from "vitest"
import type { AgentToolResult } from "@/agent/core/types"

const mocks = vi.hoisted(() => ({
  execCommand: vi.fn(),
  waitForExit: vi.fn(),
  killProcess: vi.fn(),
}))

vi.mock("@/agent/shell/unifiedExecManager", () => ({
  unifiedExecManager: mocks,
}))

import { createBashTool } from "@/agent/tools/bash"

const runningResult = (processId: number, output: string) => ({
  processId,
  output,
  exitCode: null,
  isRunning: true,
  status: "running" as const,
  totalBytes: output.length,
  omittedBytes: 0,
})

const completedResult = (processId: number, output: string, omittedBytes = 0) => ({
  processId,
  output,
  exitCode: 0,
  isRunning: false,
  status: "completed" as const,
  totalBytes: output.length + omittedBytes,
  omittedBytes,
})

const textOf = (result: AgentToolResult): string => {
  const block = result.content[0]
  return block.type === "text" ? block.text : ""
}

describe("bash 超时等待预算", () => {
  const tool = createBashTool(process.cwd())

  it("超时预算内继续等待命令真实退出，不提前 kill", async () => {
    mocks.execCommand.mockReset()
    mocks.waitForExit.mockReset()
    mocks.killProcess.mockReset()
    mocks.execCommand.mockResolvedValue(runningResult(7, "partial"))
    mocks.waitForExit.mockResolvedValue(completedResult(7, "final output"))

    const result = await tool.execute("call-1", { command: "long-task", timeout: 120 })

    expect(mocks.waitForExit).toHaveBeenCalledWith(7, expect.any(Number))
    expect(mocks.killProcess).not.toHaveBeenCalled()
    expect(textOf(result)).toContain("final output")
  })

  it("预算耗尽后仍运行则终止进程并报告超时", async () => {
    mocks.execCommand.mockReset()
    mocks.waitForExit.mockReset()
    mocks.killProcess.mockReset()
    mocks.execCommand.mockResolvedValue(runningResult(8, "partial"))
    mocks.waitForExit.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
      return runningResult(8, "partial")
    })

    const result = await tool.execute("call-2", { command: "long-task", timeout: 0.5 })

    expect(mocks.killProcess).toHaveBeenCalledWith(8)
    expect(textOf(result)).toContain("timed out after 0.5 seconds")
  })

  it("进程被回收（waitForExit 返回 undefined）时结束等待", async () => {
    mocks.execCommand.mockReset()
    mocks.waitForExit.mockReset()
    mocks.killProcess.mockReset()
    mocks.execCommand.mockResolvedValue(runningResult(9, "partial"))
    mocks.waitForExit.mockResolvedValue(undefined)

    const result = await tool.execute("call-3", { command: "long-task", timeout: 120 })

    expect(mocks.killProcess).not.toHaveBeenCalled()
    expect(textOf(result)).toContain("partial")
  })

  it("上游丢弃中段时 spill 提示不得宣称完整保存", async () => {
    mocks.execCommand.mockReset()
    mocks.waitForExit.mockReset()
    mocks.killProcess.mockReset()
    const lossyOutput = `${"head line\n".repeat(8000)}... 12345 bytes omitted ...\n${"tail line\n".repeat(8000)}`
    mocks.execCommand.mockResolvedValue(completedResult(10, lossyOutput, 12345))
    const spillTool = createBashTool(process.cwd(), { getSessionId: () => "sess-h8" })

    const result = await spillTool.execute("call-4", { command: "noisy", timeout: 120 })
    const text = textOf(result)

    expect(text).not.toContain("Full output saved")
    expect(text).toContain("not recoverable")
  })
})
