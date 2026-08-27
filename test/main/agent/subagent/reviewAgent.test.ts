import { describe, expect, it } from "vitest"
import { REVIEW_AGENT_NAME, REVIEW_AGENT_SYSTEM_PROMPT } from "@/agent/subagent/reviewAgent"

describe("Review Agent Specification", () => {
  it("should have correct review agent constants", () => {
    expect(REVIEW_AGENT_NAME).toBe("review-agent")
    expect(REVIEW_AGENT_SYSTEM_PROMPT).toContain("Defects & Correctness")
    expect(REVIEW_AGENT_SYSTEM_PROMPT).toContain("Security Vulnerabilities")
    expect(REVIEW_AGENT_SYSTEM_PROMPT).toContain("Performance & Bottlenecks")
    expect(REVIEW_AGENT_SYSTEM_PROMPT).toContain("Taste & Minimalism")
  })
})
