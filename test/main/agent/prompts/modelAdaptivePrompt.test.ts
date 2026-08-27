import { describe, expect, it } from "vitest"
import {
  CLAUDE_INSTRUCTIONS,
  DEEPSEEK_INSTRUCTIONS,
  detectModelFamily,
  formatSandboxPolicyPrompt,
  GEMINI_INSTRUCTIONS,
  GENERIC_INSTRUCTIONS,
  GLM_INSTRUCTIONS,
  getModelAdaptiveInstructions,
  GPT_5_2_CODEX_INSTRUCTIONS,
  MIMO_INSTRUCTIONS,
  MINIMAX_INSTRUCTIONS,
  QWEN_INSTRUCTIONS,
} from "@/agent/prompts/modelAdapters"
import { createDefaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"

describe("ModelAdapters and Sandbox Policy Prompts", () => {
  it("detects model family accurately across all supported LLM providers", () => {
    // OpenAI / Codex
    expect(detectModelFamily("gpt-5.2-codex")).toBe("gpt-5-codex")
    expect(detectModelFamily("openai/o3-mini")).toBe("gpt-5-codex")
    expect(detectModelFamily("gpt-5-turbo")).toBe("gpt-5-codex")

    // Anthropic Claude
    expect(detectModelFamily("claude-3-7-sonnet")).toBe("claude")
    expect(detectModelFamily("anthropic/claude-3-5-haiku")).toBe("claude")

    // Google Gemini
    expect(detectModelFamily("gemini-2.5-pro")).toBe("gemini")
    expect(detectModelFamily("google/gemini-2.0-flash")).toBe("gemini")

    // DeepSeek
    expect(detectModelFamily("deepseek-reasoner")).toBe("deepseek")
    expect(detectModelFamily("deepseek-chat")).toBe("deepseek")

    // Alibaba Qwen
    expect(detectModelFamily("qwen-2.5-coder-32b")).toBe("qwen")
    expect(detectModelFamily("qwen-plus")).toBe("qwen")

    // 智谱 GLM / CodeGeeX
    expect(detectModelFamily("glm-4-plus")).toBe("glm")
    expect(detectModelFamily("codegeex-4")).toBe("glm")
    expect(detectModelFamily("zhipu/glm-4-flash")).toBe("glm")

    // MiniMax
    expect(detectModelFamily("minimax-text-01")).toBe("minimax")
    expect(detectModelFamily("abab6.5s-chat")).toBe("minimax")

    // 小米 MiMo
    expect(detectModelFamily("mimo-v2-flash")).toBe("mimo")
    expect(detectModelFamily("xiaomi/mimo")).toBe("mimo")

    // 通用兜底
    expect(detectModelFamily("unknown-custom-model")).toBe("generic")
    expect(detectModelFamily(undefined)).toBe("generic")
  })

  it("provides correct adaptive instructions per family", () => {
    expect(getModelAdaptiveInstructions("gpt-5-codex")).toBe(GPT_5_2_CODEX_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("claude")).toBe(CLAUDE_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("gemini")).toBe(GEMINI_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("deepseek")).toBe(DEEPSEEK_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("qwen")).toBe(QWEN_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("glm")).toBe(GLM_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("minimax")).toBe(MINIMAX_INSTRUCTIONS)
    expect(getModelAdaptiveInstructions("mimo")).toBe(MIMO_INSTRUCTIONS)
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

  it("assembles full system prompt with specific model adapter and sandbox policy", () => {
    const manager = createDefaultSystemPromptManager()

    // 测试 GLM 适配装配
    const glmPrompt = manager.renderSync({
      modelId: "glm-4-plus",
      sandboxPolicy: "workspace-write",
      cwd: "/test/project",
    })
    expect(glmPrompt).toContain("Operational Guidelines (Zhipu GLM / CodeGeeX Architecture)")
    expect(glmPrompt).toContain("Contextual Integrity")
    expect(glmPrompt).toContain("<sandbox_policy>")

    // 测试 MiniMax 适配装配
    const minimaxPrompt = manager.renderSync({
      modelId: "minimax-text-01",
      sandboxPolicy: "read-only",
      cwd: "/test/project",
    })
    expect(minimaxPrompt).toContain("Operational Guidelines (MiniMax Architecture)")
    expect(minimaxPrompt).toContain("Long-Context Grounding")
    expect(minimaxPrompt).toContain("Current policy: read-only")

    // 测试 MiMo 适配装配
    const mimoPrompt = manager.renderSync({
      modelId: "mimo-v2-flash",
      sandboxPolicy: "danger-full-access",
      cwd: "/test/project",
    })
    expect(mimoPrompt).toContain("Operational Guidelines (Xiaomi MiMo Architecture)")
    expect(mimoPrompt).toContain("Agentic Execution Loop")
    expect(mimoPrompt).toContain("Current policy: danger-full-access")

    // 测试未命中时的 Generic 兜底装配
    const fallbackPrompt = manager.renderSync({
      modelId: "other-unknown-llm",
      sandboxPolicy: "workspace-write",
      cwd: "/test/project",
    })
    expect(fallbackPrompt).toContain("Execution Standards (Universal Agent Guidelines)")
    expect(fallbackPrompt).toContain("Autonomous & Precise")
  })
})
