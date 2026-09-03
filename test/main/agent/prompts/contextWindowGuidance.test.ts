import { describe, expect, it } from "vitest"
import {
  createDefaultSystemPromptManager,
  PROMPT_SECTION_NAMES,
} from "@/agent/prompts/systemPromptManager"

describe("Context Window Guidance Harness 深度测试", () => {
  const manager = createDefaultSystemPromptManager()

  it("边界测试：未提供 contextUsage 或 contextWindow <= 0 时不注入", async () => {
    const res1 = await manager.assemble({})
    expect(
      res1.contexts.find((c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE),
    ).toBeUndefined()

    const res2 = await manager.assemble({ contextUsage: null })
    expect(
      res2.contexts.find((c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE),
    ).toBeUndefined()

    const res3 = await manager.assemble({ contextUsage: { tokens: 100, contextWindow: 0 } })
    expect(
      res3.contexts.find((c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE),
    ).toBeUndefined()
  })

  it("边界测试：精准临界值 74.9%（不触发）与 75.0%（触发 Warning）", async () => {
    // 74.9%
    const below = await manager.assemble({
      contextUsage: { tokens: 74_900, contextWindow: 100_000 },
    })
    expect(
      below.contexts.find((c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE),
    ).toBeUndefined()

    // 75.0%
    const at = await manager.assemble({
      contextUsage: { tokens: 75_000, contextWindow: 100_000 },
    })
    const atCtx = at.contexts.find((c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE)
    expect(atCtx).toBeDefined()
    expect(atCtx?.text).toContain('level="warning"')
    expect(atCtx?.text).toContain("75%")
    expect(atCtx?.text).toContain("25,000 tokens remaining")
  })

  it("边界测试：精准临界值 89.9%（Warning）与 90.0%（Critical 切换）", async () => {
    // 89.9%
    const warning = await manager.assemble({
      contextUsage: { tokens: 89_900, contextWindow: 100_000 },
    })
    const warnCtx = warning.contexts.find(
      (c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
    )
    expect(warnCtx?.text).toContain('level="warning"')
    expect(warnCtx?.text).not.toContain('level="critical"')

    // 90.0%
    const critical = await manager.assemble({
      contextUsage: { tokens: 90_000, contextWindow: 100_000 },
    })
    const critCtx = critical.contexts.find(
      (c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
    )
    expect(critCtx?.text).toContain('level="critical"')
    expect(critCtx?.text).toContain("90%")
    expect(critCtx?.text).toContain("10,000 tokens remaining")
    expect(critCtx?.text).toContain("/compact")
  })

  it("极端溢出测试：Token 使用超过 100% 时的防御与格式安全", async () => {
    const overflow = await manager.assemble({
      contextUsage: { tokens: 120_000, contextWindow: 100_000 },
    })
    const critCtx = overflow.contexts.find(
      (c) => c.name === PROMPT_SECTION_NAMES.CONTEXT_WINDOW_GUIDANCE,
    )
    expect(critCtx).toBeDefined()
    expect(critCtx?.text).toContain('level="critical"')
    expect(critCtx?.text).toContain("100%")
    expect(critCtx?.text).toContain("0 tokens remaining")
  })

  it("模式协同测试：在 Plan Mode 下同时装配，Guidance 与 proposed_plan 契约互不干扰", async () => {
    const planAssembly = await manager.assemble({
      collaborationMode: "plan",
      contextUsage: { tokens: 85_000, contextWindow: 100_000 },
    })

    // Plan Mode 行为约束与 Guidance 并存
    expect(planAssembly.rendered).toContain("# Collaboration Mode: Plan Mode")
    expect(planAssembly.rendered).toContain("<proposed_plan>")
    expect(planAssembly.rendered).toContain('<context_window_guidance level="warning">')
    expect(planAssembly.rendered).toContain("85%")
  })

  it("模式协同测试：在 Review Mode 下同时装配，Guidance 与 review_findings 契约互不干扰", async () => {
    const reviewAssembly = await manager.assemble({
      collaborationMode: "review",
      contextUsage: { tokens: 92_000, contextWindow: 100_000 },
    })

    // Review Mode 行为约束与 Critical Guidance 并存
    expect(reviewAssembly.rendered).toContain("# Collaboration Mode: Review Mode")
    expect(reviewAssembly.rendered).toContain("<review_findings>")
    expect(reviewAssembly.rendered).toContain('<context_window_guidance level="critical">')
    expect(reviewAssembly.rendered).toContain("92%")
    expect(reviewAssembly.rendered).toContain("/compact")
  })
})
