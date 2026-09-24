import { describe, expect, it, vi } from "vitest"
import { createSwitchModeTool, type SwitchModeDeps } from "@/agent/tools/switchMode"

// 构造可控依赖：缺省 auto + build 有效模式、切换成功、退出审批通过。
const createDeps = (overrides: Partial<SwitchModeDeps> = {}): SwitchModeDeps => ({
  getBaseMode: () => "auto",
  getEffectiveMode: () => "build",
  switchEffectiveMode: vi.fn(() => ({ ok: true as const })),
  requestExitApproval: vi.fn(async () => true),
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

  it("进入只读模式即时生效（无需审批）并返回模式契约引导", async () => {
    const requestExitApproval = vi.fn(async () => true)
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({ switchEffectiveMode, requestExitApproval })
    const text = await runTool(deps, { mode: "plan" })
    expect(requestExitApproval).not.toHaveBeenCalled()
    expect(switchEffectiveMode).toHaveBeenCalledWith("plan")
    expect(text).toContain("Plan Mode")
    expect(text).toContain("<proposed_plan>")
    expect(text).toContain("requires the user's approval")
  })

  it("只读模式间切换（plan → review）无需审批", async () => {
    const requestExitApproval = vi.fn(async () => true)
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({
      getEffectiveMode: () => "plan",
      switchEffectiveMode,
      requestExitApproval,
    })
    const text = await runTool(deps, { mode: "review" })
    expect(requestExitApproval).not.toHaveBeenCalled()
    expect(switchEffectiveMode).toHaveBeenCalledWith("review")
    expect(text).toContain("<review_findings>")
  })

  it("退出只读模式需审批：批准后切换并返回 build 引导", async () => {
    const requestExitApproval = vi.fn(async () => true)
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({
      getEffectiveMode: () => "plan",
      switchEffectiveMode,
      requestExitApproval,
    })
    const text = await runTool(deps, { mode: "build" })
    expect(requestExitApproval).toHaveBeenCalledWith({ toolCallId: "tc-1", fromMode: "plan" })
    expect(switchEffectiveMode).toHaveBeenCalledWith("build")
    expect(text).toContain("Build Mode")
  })

  it("拒绝退出时保持原模式并返回留在原模式的引导", async () => {
    const switchEffectiveMode = vi.fn(() => ({ ok: true as const }))
    const deps = createDeps({
      getEffectiveMode: () => "review",
      switchEffectiveMode,
      requestExitApproval: vi.fn(async () => false),
    })
    const text = await runTool(deps, { mode: "build" })
    expect(switchEffectiveMode).not.toHaveBeenCalled()
    expect(text).toContain("declined to exit review Mode")
    expect(text).toContain("Remain in review Mode")
  })

  it("design 退出同样走审批", async () => {
    const requestExitApproval = vi.fn(async () => true)
    const deps = createDeps({
      getEffectiveMode: () => "design",
      requestExitApproval,
    })
    await runTool(deps, { mode: "build" })
    expect(requestExitApproval).toHaveBeenCalledWith({ toolCallId: "tc-1", fromMode: "design" })
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
