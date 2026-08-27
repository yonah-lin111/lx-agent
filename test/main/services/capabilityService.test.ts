import { describe, expect, it } from "vitest"
import { getDefaultCapabilities } from "@/services/capabilityService"

describe("capabilityService", () => {
  it("默认能力集为全量内置工具（含联网搜索与 LSP），mcp/skills 空", () => {
    expect(getDefaultCapabilities()).toEqual({
      tools: [
        "read",
        "ls",
        "grep",
        "find",
        "write",
        "edit",
        "apply_patch",
        "bash",
        "time",
        "todowrite",
        "switch_mode",
        "web_search",
        "webfetch",
        "task",
        "question",
        "render_svg",
        "render_ascii",
        "render_html",
        "lsp",
        "job_output",
        "job_list",
        "job_kill",
      ],
      mcp: [],
      skills: [],
    })
  })
})
