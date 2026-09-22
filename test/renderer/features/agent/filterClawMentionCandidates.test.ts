import { describe, expect, it } from "vitest"
import { filterClawMentionCandidates } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"

const candidates = [
  { instanceId: "local", agentId: "lily", name: "Lily", instanceName: "研发中心" },
  { instanceId: "local", agentId: "amy", name: "Amy", instanceName: "研发中心" },
  { instanceId: "remote", agentId: "bob", name: "Bob", instanceName: "运营中心" },
]

describe("filterClawMentionCandidates", () => {
  it("空查询与 tag 模糊命中（如 @cla）整类返回", () => {
    expect(filterClawMentionCandidates(candidates, "")).toHaveLength(3)
    expect(filterClawMentionCandidates(candidates, "cla")).toHaveLength(3)
    expect(filterClawMentionCandidates(candidates, "CLA")).toHaveLength(3)
  })

  it("claw: / claw/ 前缀裁剪后按字段过滤", () => {
    expect(filterClawMentionCandidates(candidates, "claw")).toHaveLength(3)
    expect(filterClawMentionCandidates(candidates, "claw:")).toHaveLength(3)
    expect(
      filterClawMentionCandidates(candidates, "claw:local/lily").map((item) => item.agentId),
    ).toEqual(["lily"])
  })

  it("无前缀查询直接按员工名 / agentId / 实例 id / 实例名过滤", () => {
    expect(filterClawMentionCandidates(candidates, "amy").map((item) => item.name)).toEqual(["Amy"])
    expect(filterClawMentionCandidates(candidates, "bob").map((item) => item.name)).toEqual(["Bob"])
    expect(filterClawMentionCandidates(candidates, "remote").map((item) => item.name)).toEqual([
      "Bob",
    ])
    expect(filterClawMentionCandidates(candidates, "运营").map((item) => item.name)).toEqual([
      "Bob",
    ])
  })

  it("既非 tag 命中也无字段命中的查询返回空", () => {
    expect(filterClawMentionCandidates(candidates, "xyz")).toEqual([])
    expect(filterClawMentionCandidates(candidates, "清空")).toEqual([])
  })
})
