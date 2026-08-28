import { describe, expect, it } from "vitest"
import {
  CLAUDE_INSTRUCTIONS,
  DEEPSEEK_INSTRUCTIONS,
  detectModelFamily,
  formatSandboxPolicyPrompt,
  GEMINI_INSTRUCTIONS,
  GENERIC_INSTRUCTIONS,
  GLM_INSTRUCTIONS,
  GPT_INSTRUCTIONS,
  getModelAdaptiveInstructions,
  MIMO_INSTRUCTIONS,
  MINIMAX_INSTRUCTIONS,
  QWEN_INSTRUCTIONS,
} from "@/agent/prompts/modelAdapters"
import { createDefaultSystemPromptManager } from "@/agent/prompts/systemPromptManager"

describe("ModelAdapters and Sandbox Policy Prompts", () => {
  it("detects model family accurately based purely on vendor signatures (version-agnostic)", () => {
    // OpenAI / GPT (不限任何未来版本号：gpt-4o, gpt-5.2, gpt-6, codex-next 等)
    expect(detectModelFamily("gpt-4o")).toBe("gpt")
    expect(detectModelFamily("gpt-5.2-codex")).toBe("gpt")
    expect(detectModelFamily("gpt-6-turbo")).toBe("gpt")
    expect(detectModelFamily("openai/o3-mini")).toBe("gpt")
    expect(detectModelFamily("openai/o4-high")).toBe("gpt")
    expect(detectModelFamily("chatgpt-plus")).toBe("gpt")

    // Anthropic Claude (claude-3, claude-3.5, claude-4 等)
    expect(detectModelFamily("claude-3-7-sonnet")).toBe("claude")
    expect(detectModelFamily("claude-4-opus")).toBe("claude")
    expect(detectModelFamily("anthropic/custom-claude")).toBe("claude")

    // Google Gemini (gemini-1.5, gemini-2.0, gemini-3.0 等)
    expect(detectModelFamily("gemini-2.5-pro")).toBe("gemini")
    expect(detectModelFamily("gemini-3.0-ultra")).toBe("gemini")
    expect(detectModelFamily("google/gemini-flash")).toBe("gemini")

    // DeepSeek (deepseek-v2, deepseek-v3, deepseek-r1, deepseek-r2 等)
    expect(detectModelFamily("deepseek-chat")).toBe("deepseek")
    expect(detectModelFamily("deepseek-reasoner-v2")).toBe("deepseek")
    expect(detectModelFamily("dsh-agent-v3")).toBe("deepseek")

    // Alibaba Qwen (qwen-2, qwen-2.5, qwen-3 等)
    expect(detectModelFamily("qwen-2.5-coder-32b")).toBe("qwen")
    expect(detectModelFamily("qwen-3-max")).toBe("qwen")
    expect(detectModelFamily("tongyi-coder-next")).toBe("qwen")

    // 智谱 GLM / CodeGeeX (glm-4, glm-5, chatglm, codegeex 等)
    expect(detectModelFamily("glm-4-plus")).toBe("glm")
    expect(detectModelFamily("glm-5-zero")).toBe("glm")
    expect(detectModelFamily("chatglm-pro")).toBe("glm")
    expect(detectModelFamily("codegeex-5")).toBe("glm")

    // MiniMax (minimax-text, abab-6.5, abab-7 等)
    expect(detectModelFamily("minimax-text-01")).toBe("minimax")
    expect(detectModelFamily("minimax-next-m4")).toBe("minimax")
    expect(detectModelFamily("abab7-chat")).toBe("minimax")

    // 小米 MiMo (mimo-v2, mimo-v3 等)
    expect(detectModelFamily("mimo-v2-flash")).toBe("mimo")
    expect(detectModelFamily("mimo-v3-pro")).toBe("mimo")
    expect(detectModelFamily("xiaomi/mimo-coder")).toBe("mimo")

    // 通用兜底（无任何厂商匹配）
    expect(detectModelFamily("mistral-large")).toBe("generic")
    expect(detectModelFamily("llama-3.3-70b")).toBe("generic")
    expect(detectModelFamily("my-custom-model")).toBe("generic")
    expect(detectModelFamily(undefined)).toBe("generic")
  })

  it("provides correct adaptive instructions per family", () => {
    expect(getModelAdaptiveInstructions("gpt")).toBe(GPT_INSTRUCTIONS)
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
