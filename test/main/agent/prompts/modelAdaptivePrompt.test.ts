import { describe, expect, it } from "vitest"
import {
  CLAUDE_INSTRUCTIONS,
  DEEPSEEK_INSTRUCTIONS,
  detectModelFamily,
  formatSandboxPolicyPrompt,
  GEMINI_INSTRUCTIONS,
  GENERIC_INSTRUCTIONS,
  getModelAdaptiveInstructions,
  GPT_5_2_CODEX_INSTRUCTIONS,
  QWEN_INSTRUCTIONS,
} from "@/agent/prompts/modelAdapters"
import { createDefaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"

describe("ModelAdapters and Sandbox Policy Prompts", () => {
  it("detects model family accurately across major LLM providers", () => {
    expect(detectModelFamily("gpt-5.2-codex")).toBe("gpt-5-codex")
    expect(detectModelFamily("openai/o3-mini")).toBe("gpt-5-codex")
    expect(detectModelFamily("claude-3-7-sonnet")).toBe("claude")
    expect(detectModelFamily("gemini-2.5-pro")).toBe("gemini")
    expect(detectModelFamily("google/gemini-2.0-flash")).toBe("gemini")
    expect(detectModelFamily("deepseek-reasoner")).toBe("deepseek")
    expect(detectModelFamily("deepseek-chat")).toBe("deepseek")
    expect(detectModelFamily("qwen-2.5-coder-32b")).toBe("qwen")
    expect(detectModelFamily("generic-custom-llm")).toBe("generic")
    expect(detectModelFamily(undefined)).toBe("generic")
  })

  it("provides correct adaptive instructions per family", () => {
    expect(getModelAdaptiveInstructions("gpt-5-codex")).toBe(GPT_5_2_CODEX_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("claude")).toBe(CLAUDE_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("gemini")).toBe(GEMINI_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("deepseek")).toBe(DEEPSEEK_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("qwen")).toBe(QWEN_INSTRUCTIONS)
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
      modelId: "claude-3-7-sonnet",
      sandboxPolicy: "workspace-write",
      cwd: "/test/project",
    })

    expect(prompt).toContain("Operational Guidelines (Anthropic Claude Architecture)")
    expect(prompt).toContain("Structured Disambiguation")
    expect(prompt).toContain("<sandbox_policy>")
    expect(prompt).toContain("Current policy: workspace-write")
  })
})
