// @vitest-environment jsdom

import type { AgentMessage } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { parseTextWithProposedPlan, toChatMessage } from "@/features/agent/utils"

// 流式调用：未闭合标签允许渐进渲染。
const parseStreaming = (text: string) =>
  parseTextWithProposedPlan(text, undefined, undefined, undefined, undefined, true)

describe("结构化标签解析：定稿必须闭合，流式允许未闭合", () => {
  it("定稿消息中行内引用 <proposed_plan> 不产出计划块", () => {
    const raw = "plan：只读架构设计，输出结构化 `<proposed_plan>`。\n\n### 三、提示词链路"
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks).toEqual([{ kind: "text", text: raw, durationMs: undefined }])
  })

  it("定稿消息中行内引用 <review_findings> 不产出审查块", () => {
    const raw = "review：输出 `<review_findings>` 结构化报告。\n\n### 附录"
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.every((block) => block.kind === "text")).toBe(true)
  })

  it("定稿消息中行内引用 <front_design> / <front_design_update> 不产出设计块", () => {
    const raw = "design：按 `<front_design>` 与 `<front_design_update>` 协议输出原型。"
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.every((block) => block.kind === "text")).toBe(true)
  })

  it("流式消息中未闭合标签仍产出结构化块（渐进渲染）", () => {
    const planBlocks = parseStreaming("方案：\n<proposed_plan>\n# 标题\n内容")
    expect(planBlocks[1]?.kind).toBe("proposedPlan")
    if (planBlocks[1]?.kind === "proposedPlan") {
      expect(planBlocks[1].plan.isStreaming).toBe(true)
    }

    const designBlocks = parseStreaming('<front_design title="Navbar">\n<nav class="flex">')
    expect(designBlocks[0]?.kind).toBe("frontDesign")
    if (designBlocks[0]?.kind === "frontDesign") {
      expect(designBlocks[0].design.isStreaming).toBe(true)
    }
  })

  it("定稿消息中成对闭合标签仍正常产出结构化块", () => {
    const raw = "前言\n<proposed_plan>\n# 实施计划\n- 步骤一\n</proposed_plan>\n结尾"
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.map((block) => block.kind)).toEqual(["text", "proposedPlan", "text"])
  })

  it("定稿消息：未闭合引用标签之后的真实闭合块照常解析", () => {
    const raw =
      "见 `<proposed_plan>` 协议：\n<review_findings>\n## Summary\n结论\n</review_findings>"
    const blocks = parseTextWithProposedPlan(raw)
    const kinds = blocks.map((block) => block.kind)
    expect(kinds).toContain("reviewFindings")
    expect(kinds).not.toContain("proposedPlan")
    expect(blocks[0]).toMatchObject({ kind: "text" })
  })

  it("toChatMessage：定稿报告中的行内标签引用不产生计划卡片，流式片段仍渲染", () => {
    const text =
      "3. 四类协作模式\n   - `plan`：只读架构设计，输出结构化 `<proposed_plan>`。\n\n### 三、提示词链路"
    const message: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text }],
      provider: "test",
      model: "test-model",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
      stopReason: "stop",
      timestamp: 1,
    }

    const finalized = toChatMessage(message, false, "msg-1")
    expect(finalized.blocks.some((block) => block.kind === "proposedPlan")).toBe(false)

    const streaming: AgentMessage = {
      ...message,
      content: [{ type: "text", text: "方案：\n<proposed_plan>\n# 标题" }],
      stopReason: "pending",
    }
    const live = toChatMessage(streaming, true, "msg-2")
    expect(live.blocks.some((block) => block.kind === "proposedPlan")).toBe(true)
  })
})
