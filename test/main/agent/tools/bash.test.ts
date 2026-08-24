import { describe, expect, it } from "vitest"
import type { BashToolDetails } from "../../../../src/main/agent/tools/bash"
import { createBashTool } from "../../../../src/main/agent/tools/bash"

describe("createBashTool", () => {
  const tool = createBashTool(process.cwd())

  it("无 session 时普通命令正常执行", async () => {
    const res = await tool.execute("call-1", { command: "echo hello" })
    const textContent = res.content[0]
    if (textContent.type === "text") {
      expect(textContent.text).toContain("hello")
    }
  })

  it("background 与 session 互斥报错", async () => {
    const res = await tool.execute("call-2", {
      command: "echo 1",
      background: true,
      session: "main",
    })
    const textContent = res.content[0]
    if (textContent.type === "text") {
      expect(textContent.text).toContain("互斥")
    }
    const details = res.details as BashToolDetails & { error?: string }
    expect(details?.error).toBe("invalid_args")
  })
})
