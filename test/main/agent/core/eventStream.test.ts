import type { AssistantMessage } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { createAssistantMessageEventStream } from "@/agent/core/event-stream"

const partial = (): AssistantMessage => ({
  role: "assistant",
  content: [],
  provider: "p",
  model: "m",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
  stopReason: "pending",
  timestamp: 0,
})

describe("EventStream 提前终止", () => {
  it("消费者提前退出时不产生 unhandled rejection", async () => {
    const stream = createAssistantMessageEventStream()
    const unhandled: unknown[] = []
    const handler = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", handler)
    try {
      const iterator = stream[Symbol.asyncIterator]()
      const pending = iterator.next()
      stream.push({ type: "start", partial: partial() })
      await pending
      await iterator.return!(undefined)
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(unhandled).toEqual([])
    } finally {
      process.off("unhandledRejection", handler)
    }
  })

  it("result() 在无结果结束时仍如实 reject（契约保持不变）", async () => {
    const stream = createAssistantMessageEventStream()
    const iterator = stream[Symbol.asyncIterator]()
    const pending = iterator.next()
    stream.push({ type: "start", partial: partial() })
    await pending
    await iterator.return!(undefined)

    await expect(stream.result()).rejects.toThrow("Stream ended without result")
  })
})
