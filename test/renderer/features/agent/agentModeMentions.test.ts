import { getEffectiveAutoTargets } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { filterAgentModeMentionCandidates } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"

describe("filterAgentModeMentionCandidates 模式补全过滤", () => {
  const dummyT = (key: string) => {
    if (key === "agent.collaborationModePlan") return "规划模式"
    if (key === "agent.collaborationModePlanDesc") return "先出计划再落地"
    if (key === "agent.collaborationModeReview") return "审查模式"
    if (key === "agent.collaborationModeReviewDesc") return "只读审查代码"
    if (key === "agent.collaborationModeDesign") return "设计模式"
    if (key === "agent.collaborationModeDesignDesc") return "前端原型开发"
    if (key === "agent.collaborationModeBuild") return "构建模式"
    if (key === "agent.collaborationModeBuildDesc") return "执行修改"
    return key
  }

  const allTargets = getEffectiveAutoTargets()

  it("空查询返回所有有效目标模式", () => {
    const results = filterAgentModeMentionCandidates(allTargets, "", dummyT)
    expect(results.map((r) => r.mode)).toEqual(["build", "plan", "review", "design"])
  })

  it("通过模式名称模糊过滤", () => {
    const results = filterAgentModeMentionCandidates(allTargets, "plan", dummyT)
    expect(results).toHaveLength(1)
    expect(results[0]?.mode).toBe("plan")
  })

  it("通过前缀 agentMode: 过滤", () => {
    const results = filterAgentModeMentionCandidates(allTargets, "agentMode:rev", dummyT)
    expect(results).toHaveLength(1)
    expect(results[0]?.mode).toBe("review")
  })

  it("通过中文标签过滤", () => {
    const results = filterAgentModeMentionCandidates(allTargets, "规划", dummyT)
    expect(results).toHaveLength(1)
    expect(results[0]?.mode).toBe("plan")
  })

  it("当 autoEnabledModes 裁剪时只返回允许的目标", () => {
    const restricted = getEffectiveAutoTargets(["plan"])
    const results = filterAgentModeMentionCandidates(restricted, "", dummyT)
    expect(results.map((r) => r.mode)).toEqual(["build", "plan"])
  })

  it("claw 前缀或 agent: 前缀时返回空数组，避免与 OpenClaw / 子代理冲突", () => {
    expect(filterAgentModeMentionCandidates(allTargets, "claw:test", dummyT)).toHaveLength(0)
    expect(filterAgentModeMentionCandidates(allTargets, "agent:explorer", dummyT)).toHaveLength(0)
  })
})
