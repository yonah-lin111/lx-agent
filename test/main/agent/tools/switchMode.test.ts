import { describe, expect, it, vi } from "vitest"
import { createSwitchModeTool, type SwitchModeDeps } from "@/agent/tools/switchMode"

// 构造可控依赖：缺省 auto + build 有效模式、切换成功。
const createDeps = (overrides: Partial<SwitchModeDeps> = {}): SwitchModeDeps => ({
  getBaseMode: () => "auto",
  getEffectiveMode: () => "build",
  switchEffectiveMode: vi.fn(() => ({ ok: true as const })),
  ...overrides,
})

// 执行工具并提取文本结果。
const runTool = async (
  deps: SwitchModeDeps,
  params: Parameters<ReturnType<typeof createSwitchModeTool>["execute"]>[1],
): Promise<string> => {
  const tool = createSwitchModeTool(deps)
  const result = await tool.execute("tc-1", params)
  return result.content.map((block) => (block.type === "text" ? block.text : "")).join("")
}

describe("switch_mode 工具（auto 编排）", () => {
  it("非 auto 基础模式拒绝执行，不触发任何切换", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ getBaseMode: () => "plan", switchEffectiveMode })
    const text = await runTool(deps, { mode: "build" })
    expect(text).toContain("only available in Auto Mode")
    expect(switchEffectiveMode).not.toHaveBeenCalled()
  })

  it("目标等于当前有效模式时为幂等空操作", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ getEffectiveMode: () => "plan", switchEffectiveMode })
    const text = await runTool(deps, { mode: "plan" })
    expect(text).toContain("Already in 'plan' mode")
    expect(switchEffectiveMode).not.toHaveBeenCalled()
  })

  it("进入只读模式即时生效并返回模式契约引导", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ switchEffectiveMode })
    const text = await runTool(deps, { mode: "plan" })
    expect(switchEffectiveMode).toHaveBeenCalledWith("plan")
    expect(text).toContain("Plan Mode")
    expect(text).toContain("<proposed_plan>")
  })

  it("退出只读模式自行切换（无审批），返回 build 引导", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ getEffectiveMode: () => "plan", switchEffectiveMode })
    const text = await runTool(deps, { mode: "build" })
    expect(switchEffectiveMode).toHaveBeenCalledWith("build")
    expect(text).toContain("Build Mode")
  })

  it("只读模式间切换（plan → review）即时生效", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ getEffectiveMode: () => "plan", switchEffectiveMode })
    const text = await runTool(deps, { mode: "review" })
    expect(switchEffectiveMode).toHaveBeenCalledWith("review")
    expect(text).toContain("<review_findings>")
  })

  it("design → build 同样自行切换", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ getEffectiveMode: () => "design", switchEffectiveMode })
    await runTool(deps, { mode: "build" })
    expect(switchEffectiveMode).toHaveBeenCalledWith("build")
  })

  it("切换失败时返回错误文本且不产生引导", async () => {
    const deps = createDeps({
      switchEffectiveMode: vi.fn(() => ({ ok: false as const, error: "boom" })),
    })
    const text = await runTool(deps, { mode: "plan" })
    expect(text).toBe("boom")
    expect(text).not.toContain("Switched to")
  })
})
