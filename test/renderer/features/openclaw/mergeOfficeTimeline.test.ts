import type { OpenClawChatMessage, OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { describe, expect, it } from "vitest"
import { mergeOfficeTimeline, type OfficeAgentSession } from "@/features/openclaw"

const message = (id: string, timestamp: number, content: string): OpenClawChatMessage => ({
  id,
  role: "assistant",
  content,
  timestamp,
  status: "completed",
})

const session = (agentId: string, messages: OpenClawChatMessage[] | null): OfficeAgentSession => ({
  agentId,
  snapshot:
    messages === null
      ? undefined
      : ({
          instanceId: "local",
          agentId,
          sessionKey: `local ${agentId}`,
          connectionStatus: "connected",
          isStreaming: false,
          messages,
        } satisfies OpenClawSessionSnapshot),
})

describe("mergeOfficeTimeline", () => {
  it("跨 Agent 按时间戳交错合并（仅视觉合并，不共享上下文）", () => {
    const timeline = mergeOfficeTimeline([
      session("lily", [message("a1", 100, "lily-1"), message("a3", 300, "lily-2")]),
      session("amy", [message("a2", 200, "amy-1")]),
    ])

    expect(timeline.map((item) => item.message.content)).toEqual(["lily-1", "amy-1", "lily-2"])
    expect(timeline.map((item) => item.agentId)).toEqual(["lily", "amy", "lily"])
  })

  it("时间戳相同时按消息 id 稳定排序", () => {
    const timeline = mergeOfficeTimeline([
      session("lily", [message("b", 100, "b")]),
      session("amy", [message("a", 100, "a")]),
    ])

    expect(timeline.map((item) => item.message.id)).toEqual(["a", "b"])
  })

  it("跳过尚未加载快照的 Agent", () => {
    const timeline = mergeOfficeTimeline([
      session("lily", null),
      session("amy", [message("a", 1, "hi")]),
    ])

    expect(timeline).toHaveLength(1)
    expect(timeline[0]?.agentId).toBe("amy")
  })
})
