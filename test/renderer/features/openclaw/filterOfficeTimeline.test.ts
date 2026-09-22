import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import { describe, expect, it } from "vitest"
import { filterOfficeTimeline, type OfficeTimelineMessage } from "@/features/openclaw"

const assistant = (id: string, agentId: string): OfficeTimelineMessage => ({
  agentId,
  message: {
    id,
    role: "assistant",
    content: id,
    timestamp: 1,
    status: "completed",
  } satisfies OpenClawChatMessage,
})

const user = (id: string, agentIds: string[]): OfficeTimelineMessage => ({
  agentId: agentIds[0] ?? "lily",
  message: {
    id,
    role: "user",
    content: id,
    timestamp: 1,
    status: "completed",
  } satisfies OpenClawChatMessage,
  targetAgentIds: agentIds,
})

describe("filterOfficeTimeline", () => {
  it("null 或空集合表示不筛选，返回同一引用", () => {
    const timeline = [assistant("a", "lily")]

    expect(filterOfficeTimeline(timeline, null)).toBe(timeline)
    expect(filterOfficeTimeline(timeline, [])).toBe(timeline)
  })

  it("只保留选中员工的消息", () => {
    const timeline = [assistant("a", "lily"), assistant("b", "amy")]

    expect(filterOfficeTimeline(timeline, ["lily"]).map((item) => item.message.id)).toEqual(["a"])
  })

  it("扇出用户消息与任一选中员工有交集即保留，且不裁剪目标名单", () => {
    const timeline = [user("u1", ["lily", "amy"]), assistant("a", "lily")]

    const filtered = filterOfficeTimeline(timeline, ["amy"])

    expect(filtered.map((item) => item.message.id)).toEqual(["u1"])
    expect(filtered[0]?.targetAgentIds).toEqual(["lily", "amy"])
  })

  it("无交集的消息被剔除", () => {
    const timeline = [assistant("a", "lily"), assistant("b", "amy")]

    expect(filterOfficeTimeline(timeline, ["lucy"])).toEqual([])
  })
})
