import { describe, expect, it } from "vitest"
import { DEFAULT_BEHAVIOR_PROMPT } from "@/agent/prompts/behaviorPrompt"

describe("DEFAULT_BEHAVIOR_PROMPT (XML 行为基线)", () => {
  it("以 <behavior> 为根，包含全部语义分段且各段非空", () => {
    expect(DEFAULT_BEHAVIOR_PROMPT.startsWith("<behavior>")).toBe(true)
    expect(DEFAULT_BEHAVIOR_PROMPT.endsWith("</behavior>")).toBe(true)

    for (const tag of [
      "preamble",
      "task_planning",
      "ambition_vs_precision",
      "file_mutations",
      "multi_agent",
      "verification",
      "safety",
      "response_format",
      "code_review",
      "frontend_design",
    ]) {
      expect(DEFAULT_BEHAVIOR_PROMPT).toContain(`<${tag}>`)
      expect(DEFAULT_BEHAVIOR_PROMPT).toContain(`</${tag}>`)
      const inner = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(DEFAULT_BEHAVIOR_PROMPT)
      expect(inner?.[1].trim().length ?? 0).toBeGreaterThan(0)
    }
  })

  it("不再包含 Markdown 标题，关键行为约束保持原文", () => {
    expect(DEFAULT_BEHAVIOR_PROMPT).not.toMatch(/^#{1,2} /m)

    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("`todowrite`")
    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("DO NOT ADD ANY COMMENTS")
    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("`git reset --hard`")
    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("`file_path:line_number`")
    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("`wireframe`")
    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("`![alt](url)`")
    expect(DEFAULT_BEHAVIOR_PROMPT).toContain("`lx-image://local<absolute_path>`")
  })
})
