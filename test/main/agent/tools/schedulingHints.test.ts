import { describe, expect, it } from "vitest"
import { createFindTool } from "@/agent/tools/find"
import { createGrepTool } from "@/agent/tools/grep"
import { createLsTool } from "@/agent/tools/ls"
import { createReadTool } from "@/agent/tools/read"
import { READ_ONLY_PARALLEL_HINT } from "@/agent/tools/schedulingHints"

describe("只读查询工具描述调度提示", () => {
  it("read/ls/grep/find 描述尾部包含批量并发提示", () => {
    const tools = [
      createReadTool("/tmp"),
      createLsTool("/tmp"),
      createGrepTool("/tmp"),
      createFindTool("/tmp"),
    ]

    for (const tool of tools) {
      expect(tool.description).toContain("read-only query tool")
      expect(tool.description.endsWith(READ_ONLY_PARALLEL_HINT)).toBe(true)
    }
  })
})
