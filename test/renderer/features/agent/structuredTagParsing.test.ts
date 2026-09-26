// @vitest-environment jsdom

import type { AgentMessage } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { parseTextWithProposedPlan, toAgentMessages, toChatMessage } from "@/features/agent/utils"

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

  it("定稿消息中成对 <grill_question> 解析为决策卡片块（三字段完整）", () => {
    const raw = [
      "先核对代码事实，再确认方向。",
      "<grill_question>",
      "问题: 你要的登录是本地应用锁还是远端账号登录？",
      "推荐: 本地应用锁，数据不出本机。",
      "推荐举例说明: 就像手机锁屏密码，打开 App 先输口令，全程不联网。",
      "</grill_question>",
      "请回复你的选择。",
    ].join("\n")
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.map((block) => block.kind)).toEqual(["text", "grillQuestion", "text"])

    const grillBlock = blocks[1]
    expect(grillBlock.kind).toBe("grillQuestion")
    if (grillBlock.kind === "grillQuestion") {
      expect(grillBlock.grill.question).toBe("你要的登录是本地应用锁还是远端账号登录？")
      expect(grillBlock.grill.recommendation).toBe("本地应用锁，数据不出本机。")
      expect(grillBlock.grill.example).toBe("就像手机锁屏密码，打开 App 先输口令，全程不联网。")
      expect(grillBlock.grill.isStreaming).toBe(false)
      expect(grillBlock.grill.raw).toContain("<grill_question>")
      expect(grillBlock.grill.options).toBeUndefined()
    }
  })

  it("选项规范化：A) 独立成行解析为 options，题干不含选项散文（兼容全角与多行选项）", () => {
    const raw = [
      "<grill_question>",
      '问题: 你要的"登录"是哪一种？',
      "A) 本地应用锁——启动时用本机口令解锁，纯离线。",
      "B) 云端账号登录——需要新增后端服务。",
      "（C） 其他（请具体描述），",
      "例如对接 OpenClaw 的登录。",
      "推荐: A——本项目是本地优先应用。",
      "推荐举例说明: 就像手机锁屏密码。",
      "</grill_question>",
    ].join("\n")
    const blocks = parseTextWithProposedPlan(raw)
    const grillBlock = blocks[0]
    if (grillBlock.kind !== "grillQuestion") {
      throw new Error("expected grillQuestion block")
    }
    expect(grillBlock.grill.question).toBe('你要的"登录"是哪一种？')
    expect(grillBlock.grill.options).toEqual([
      { key: "A", text: "本地应用锁——启动时用本机口令解锁，纯离线。" },
      { key: "B", text: "云端账号登录——需要新增后端服务。" },
      { key: "C", text: "其他（请具体描述），\n例如对接 OpenClaw 的登录。" },
    ])
  })

  it("开放式问题不带选项行时 options 保持缺省", () => {
    const blocks = parseStreaming(
      "<grill_question>\n问题: 导出数据量上限是多少？\n推荐: 10 万行以内。",
    )
    const grillBlock = blocks[0]
    if (grillBlock.kind !== "grillQuestion") {
      throw new Error("expected grillQuestion block")
    }
    expect(grillBlock.grill.question).toBe("导出数据量上限是多少？")
    expect(grillBlock.grill.options).toBeUndefined()
  })

  it("grill_question 兼容英文标签、Markdown 加粗与多行字段", () => {
    const raw = [
      "<grill_question>",
      "**Question**: Which storage should the export use?",
      "continued on the next line",
      "**Recommendation**: CSV without dependencies.",
      "**Recommendation example**: Like Excel's Save as CSV.",
      "</grill_question>",
    ].join("\n")
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks).toHaveLength(1)
    const grillBlock = blocks[0]
    if (grillBlock.kind === "grillQuestion") {
      expect(grillBlock.grill.question).toBe(
        "Which storage should the export use?\ncontinued on the next line",
      )
      expect(grillBlock.grill.recommendation).toBe("CSV without dependencies.")
      expect(grillBlock.grill.example).toBe("Like Excel's Save as CSV.")
    } else {
      throw new Error("expected grillQuestion block")
    }
  })

  it("流式未闭合 <grill_question> 渐进渲染：isStreaming 且缺失字段为空串", () => {
    const blocks = parseStreaming(
      "先核对一下。\n<grill_question>\n问题: 导出格式选 CSV 还是 XLSX？\n推荐: CSV",
    )
    expect(blocks.map((block) => block.kind)).toEqual(["text", "grillQuestion"])
    const grillBlock = blocks[1]
    if (grillBlock.kind === "grillQuestion") {
      expect(grillBlock.grill.question).toBe("导出格式选 CSV 还是 XLSX？")
      expect(grillBlock.grill.recommendation).toBe("CSV")
      expect(grillBlock.grill.example).toBe("")
      expect(grillBlock.grill.isStreaming).toBe(true)
    }
  })

  it("定稿消息中行内引用 <grill_question> 不产出决策卡片", () => {
    const raw = "协议：用 <grill_question> 标签包裹三行提问，客户端解析为卡片。"
    const blocks = parseTextWithProposedPlan(raw)
    expect(blocks.every((block) => block.kind === "text")).toBe(true)
  })

  it("toChatMessage → toAgentMessages 往返：grillQuestion 块还原为原始标签文本", () => {
    const text = [
      "方向确认：",
      "<grill_question>",
      "问题: 导出格式？",
      "推荐: CSV。",
      "推荐举例说明: 双击即可用 Excel 打开。",
      "</grill_question>",
    ].join("\n")
    const message: AgentMessage = {
      role: "assistant",
      content: [{ type: "text", text }],
      provider: "test",
      model: "test-model",
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2 },
      stopReason: "stop",
      timestamp: 2,
    }

    const chatMessage = toChatMessage(message, false, "msg-grill")
    expect(chatMessage.blocks.some((block) => block.kind === "grillQuestion")).toBe(true)

    const restored = toAgentMessages([chatMessage])
    const restoredText = restored
      .flatMap((entry) =>
        entry.role === "assistant" && Array.isArray(entry.content)
          ? entry.content.map((block) => (block.type === "text" ? block.text : ""))
          : [],
      )
      .join("\n")
    expect(restoredText).toContain("<grill_question>")
    expect(restoredText).toContain("问题: 导出格式？")
  })
})
