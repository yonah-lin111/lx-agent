import { describe, expect, it } from "vitest"
import {
  buildCollaborationModePrompt,
  renderCollaborationModeText,
} from "@/agent/prompts/collaborationModePrompt"
import { createDefaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"

describe("Plan Mode 内嵌 grill-me 技能", () => {
  it("plan 模式提示词包含 grill-me 技能块、<grill_question> 协议与固定三行输出格式契约", () => {
    const plan = renderCollaborationModeText("plan")
    expect(plan).toContain('<skill name="grill-me">')
    expect(plan).toContain("</skill>")
    expect(plan).toContain("<grill_question>")
    expect(plan).toContain("</grill_question>")
    expect(plan).toContain("问题: <")
    expect(plan).toContain("推荐: <")
    expect(plan).toContain("推荐举例说明: <")
  })

  it("标签契约：不翻译标签名、每轮仅一个块、问句整体包裹在标签内", () => {
    const plan = renderCollaborationModeText("plan")
    expect(plan).toContain("never translate or rename them")
    expect(plan).toContain("exactly one `<grill_question>` block")
    expect(plan).toContain("never leave one of the three lines outside the block")
  })

  it("一次只问一个问题、禁用 question 工具、每题必须带推荐与通俗举例", () => {
    const plan = renderCollaborationModeText("plan")
    expect(plan).toContain("Ask exactly ONE question per turn")
    expect(plan).toContain("NEVER call the `question` tool in Plan Mode")
    expect(plan).toContain(
      "Every question MUST carry your recommended answer and a plain-language example",
    )
    expect(plan).toContain("answerable by choosing an option or by a short sentence")
  })

  it("决策树协议：先查代码验证事实，事实是模型的责任而非用户的责任", () => {
    const plan = renderCollaborationModeText("plan")
    expect(plan).toContain("Facts are your job, never the user's")
    expect(plan).toContain("Only genuinely non-discoverable decisions reach the user")
    expect(plan).toContain("Depth-first")
  })

  it("英文系统提示词，输出语言跟随用户语言（标签本地化）", () => {
    const plan = renderCollaborationModeText("plan")
    expect(plan).toContain("Write all three lines in the user's language")
    expect(plan).toContain("`Question:` / `Recommendation:` / `Recommendation example:`")
  })

  it("auto 基础模式叠加有效 plan 模式时同样注入 grill-me；其余模式不注入", () => {
    expect(buildCollaborationModePrompt("auto", "plan")).toContain('<skill name="grill-me">')
    for (const mode of ["build", "review", "design"] as const) {
      expect(buildCollaborationModePrompt(mode, mode)).not.toContain("grill-me")
    }
  })

  it("系统提示词装配链路：plan 模式渲染包含 grill-me，build 模式不包含", async () => {
    const manager = createDefaultSystemPromptManager()

    const planPrompt = await manager.render({ collaborationMode: "plan" })
    expect(planPrompt).toContain('<collaboration_mode name="plan"')
    expect(planPrompt).toContain('<skill name="grill-me">')
    expect(planPrompt).toContain("<proposed_plan>")

    const buildPrompt = await manager.render({ collaborationMode: "build" })
    expect(buildPrompt).not.toContain("grill-me")
  })
})
