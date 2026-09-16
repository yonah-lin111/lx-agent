// @vitest-environment node
import { describe, expect, it } from "vitest"
import { mapHistoryMessage } from "@/services/openclaw/openclawClientManager/payloadMappers"

describe("mapHistoryMessage 持久化身份映射", () => {
  it("读取 __openclaw 元数据作为 entryId 与 runId（sessions.rewind 使用的 id 空间）", () => {
    const message = mapHistoryMessage(
      {
        role: "user",
        content: "hello",
        timestamp: 1,
        __openclaw: { id: "entry-1", runId: "run-1", seq: 3 },
      },
      0,
    )

    expect(message).toMatchObject({ id: "entry-1", runId: "run-1", role: "user" })
  })

  it("兼容 envelope 形态（messageId / id）与无 id 的兜底", () => {
    const envelope = mapHistoryMessage(
      {
        message: { role: "user", content: "hi", timestamp: 1 },
        messageId: "m-1",
      },
      0,
    )
    expect(envelope?.id).toBe("m-1")

    const legacy = mapHistoryMessage(
      { id: "legacy-1", role: "user", content: "hi", timestamp: 1 },
      1,
    )
    expect(legacy?.id).toBe("legacy-1")

    const fallback = mapHistoryMessage({ role: "user", content: "hi", timestamp: 1 }, 2)
    expect(fallback?.id).toBe("history-2")
  })
})
