import { describe, expect, it } from "vitest"
import { getDefaultCapabilities } from "@/services/capabilityService"

describe("capabilityService", () => {
  it("默认能力集为全量内置工具（含联网搜索），mcp/skills 空", () => {
    expect(getDefaultCapabilities()).toEqual({
      tools: [
        "read",
        "ls",
        "grep",
        "find",
        "write",
        "edit",
        "bash",
        "time",
        "todowrite",
        "web_search",
        "webfetch",
        "task",
        "question",
      ],
      mcp: [],
      skills: [],
    })
  })
})
