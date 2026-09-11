import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getConfigPath: () => holder.configPath }
})

import { hookConfig } from "@/agent/hooks/hookConfig"
import { hooksManager } from "@/agent/hooks/hooksManager"

const hookJson = (output: unknown): string => `printf '%s' '${JSON.stringify(output)}'`

let tmpDir = ""

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-hooks-manager-"))
  holder.configPath = join(tmpDir, "config.json")
  hookConfig.reset()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const writeHooks = (hooks: Record<string, unknown>): void => {
  writeFileSync(holder.configPath, JSON.stringify({ agent: { hooks } }, null, 2))
}

describe("hooksManager", () => {
  it("dispatch 按事件过滤配置，每个 hook 一条结果", async () => {
    writeHooks({
      Stop: [{ hooks: [{ name: "audit", command: hookJson({ systemMessage: "done" }) }] }],
      UserPromptSubmit: [{ hooks: [{ name: "other", command: "exit 0" }] }],
    })

    const result = await hooksManager.dispatch({
      event: "Stop",
      sessionId: "s1",
      cwd: tmpDir,
      payload: {},
    })
    expect(result.runs).toHaveLength(1)
    expect(result.runs[0]).toMatchObject({
      hook: { name: "audit", event: "Stop" },
      status: "completed",
      message: { role: "hookContext", event: "Stop", text: "done" },
    })
  })

  it("无配置时 dispatch 返回空结果", async () => {
    const result = await hooksManager.dispatch({ event: "Stop", sessionId: "s2", cwd: tmpDir })
    expect(result.runs).toEqual([])
  })

  it("dispatchBestEffort 超时不等待慢 hook（退出路径不被阻塞）", async () => {
    writeHooks({
      Stop: [{ hooks: [{ name: "slow", command: "sleep 5", timeout: 1 }] }],
    })
    const startedAt = Date.now()
    await hooksManager.dispatchBestEffort(
      { event: "Stop", sessionId: "s3", cwd: tmpDir, payload: {} },
      200,
    )
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })
})
