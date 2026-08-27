import { describe, expect, it } from "vitest"
import {
  CLAUDE_INSTRUCTIONS,
  detectModelFamily,
  formatSandboxPolicyPrompt,
  GENERIC_INSTRUCTIONS,
  getModelAdaptiveInstructions,
  GPT_5_2_CODEX_INSTRUCTIONS,
} from "@/agent/prompts/modelAdapters"
import { createDefaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"

describe("ModelAdapters and Sandbox Policy Prompts", () => {
  it("detects model family accurately", () => {
    expect(detectModelFamily("gpt-5.2-codex")).toBe("gpt-5-codex")
    expect(detectModelFamily("openai/o3-mini")).toBe("gpt-5-codex")
    expect(detectModelFamily("claude-3-5-sonnet")).toBe("claude")
    expect(detectModelFamily("deepseek-chat")).toBe("deepseek")
    expect(detectModelFamily("qwen-max")).toBe("generic")
    expect(detectModelFamily(undefined)).toBe("generic")
  })

  it("provides correct adaptive instructions per family", () => {
    expect(getModelAdaptiveInstructions("gpt-5-codex")).toBe(GPT_5_2_CODEX_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("claude")).toBe(CLAUDE_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("deepseek")).toBe(GENERIC_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("generic")).toBe(GENERIC_INSTRUCTIONS)
  })

  it("formats sandbox policy prompt block for each policy", () => {
    const readOnlyPrompt = formatSandboxPolicyPrompt("read-only")
    expect(readOnlyPrompt).toContain("<sandbox_policy>")
    expect(readOnlyPrompt).toContain("Current policy: read-only")
    expect(readOnlyPrompt).toContain("READ-ONLY SANDBOX IS ACTIVE")
    expect(readOnlyPrompt).toContain("</sandbox_policy>")

    const workspaceWritePrompt = formatSandboxPolicyPrompt("workspace-write")
    expect(workspaceWritePrompt).toContain("Current policy: workspace-write")
    expect(workspaceWritePrompt).toContain("Workspace read/write is enabled")

    const fullAccessPrompt = formatSandboxPolicyPrompt("danger-full-access")
    expect(fullAccessPrompt).toContain("Current policy: danger-full-access")
    expect(fullAccessPrompt).toContain("Full unrestricted access is granted")
  })

  it("assembles full system prompt with model-adaptive instructions and sandbox policy", () => {
    const manager = createDefaultSystemPromptManager()
    const prompt = manager.renderSync({
      modelId: "gpt-5.2-codex",
      sandboxPolicy: "read-only",
      cwd: "/test/project",
    })

    expect(prompt).toContain("## Editing constraints")
    expect(prompt).toContain("Default to ASCII when editing or creating files")
    expect(prompt).toContain("## Frontend tasks")
    expect(prompt).toContain("<sandbox_policy>")
    expect(prompt).toContain("Current policy: read-only")
  })
})
