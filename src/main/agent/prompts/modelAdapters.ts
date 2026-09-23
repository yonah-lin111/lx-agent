/**
 * 模型家族自适应指令适配器 (Model Adapters)
 *
 * 针对各大厂商模型架构（OpenAI/GPT, Anthropic/Claude, Google/Gemini, DeepSeek,
 * Alibaba/Qwen, 智谱/GLM, MiniMax, 小米/MiMo 以及通用兜底 Generic）
 * 仅基于厂商特定标识 (Vendor Identifiers) 进行自适应，完全解耦具体模型版本号。
 *
 * 指令文本统一为 Claude 风格 XML 结构（<model_adaptation family="...">）。
 */

import type { SandboxPolicy } from "@shared/contracts/agent"

/** 支持的厂商模型架构家族 */
export type ModelFamily =
  | "gpt"
  | "claude"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "glm"
  | "minimax"
  | "mimo"
  | "generic"

/**
 * 厂商特征签名映射表：纯厂商/系列标识，不绑定任何版本号
 */
const VENDOR_SIGNATURES: Array<{ family: ModelFamily; tokens: string[] }> = [
  {
    family: "gpt",
    tokens: ["gpt", "codex", "openai", "o1", "o3", "chatgpt", "text-davinci"],
  },
  {
    family: "claude",
    tokens: ["claude", "anthropic"],
  },
  {
    family: "gemini",
    tokens: ["gemini", "google"],
  },
  {
    family: "deepseek",
    tokens: ["deepseek", "dsh"],
  },
  {
    family: "qwen",
    tokens: ["qwen", "tongyi", "alibaba"],
  },
  {
    family: "glm",
    tokens: ["glm", "codegeex", "zhipu", "chatglm"],
  },
  {
    family: "minimax",
    tokens: ["minimax", "abab"],
  },
  {
    family: "mimo",
    tokens: ["mimo", "xiaomi"],
  },
]

/**
 * 根据模型标识提取厂商特定标志，匹配对应模型家族（版本无关）
 */
export function detectModelFamily(modelId?: string): ModelFamily {
  if (!modelId) return "generic"
  const normalized = modelId.toLowerCase()

  for (const entry of VENDOR_SIGNATURES) {
    if (entry.tokens.some((token) => normalized.includes(token))) {
      return entry.family
    }
  }

  return "generic"
}

/**
 * 1. OpenAI / GPT 系列专用指令集
 */
export const GPT_INSTRUCTIONS = [
  '<model_adaptation family="gpt" architecture="OpenAI GPT">',
  "  <editing_constraints>",
  "    - Default to ASCII when editing or creating files. Only introduce non-ASCII or other Unicode characters when there is a clear justification and the file already uses them.",
  '    - Add succinct code comments that explain what is going on if code is not self-explanatory. You should not add comments like "Assigns the value to the variable", but a brief comment might be useful ahead of a complex code block that the user would otherwise have to spend time parsing out. Usage of these comments should be rare.',
  "    - Try to use apply_patch for single file edits, but it is fine to explore other options (such as edit or write) if it does not work well.",
  "    - You may be in a dirty git worktree:",
  "      * NEVER revert existing changes you did not make unless explicitly requested, since these changes were made by the user.",
  "      * If asked to make a commit or code edits and there are unrelated changes to your work or changes that you didn't make in those files, don't revert those changes.",
  "      * If the changes are in files you've touched recently, read carefully and understand how you can work with the changes rather than reverting them.",
  "      * If the changes are in unrelated files, just ignore them and don't revert them.",
  "    - Do not amend a commit unless explicitly requested to do so.",
  "    - While working, if you notice unexpected changes that you didn't make, STOP IMMEDIATELY and ask the user how they would like to proceed.",
  "    - NEVER use destructive commands like `git reset --hard` or `git checkout --` unless specifically requested or approved by the user.",
  "    - Prefer non-interactive git commands over interactive ones.",
  "  </editing_constraints>",
  "  <special_user_requests>",
  "    - If the user makes a simple request (such as asking for the time) which you can fulfill by running a terminal command (such as `date`), you should do so.",
  '    - If the user asks for a "review", default to a code review mindset: prioritize identifying bugs, risks, behavioural regressions, and missing tests. Present findings first (ordered by severity with file/line references), follow with open questions or assumptions, and offer a change-summary only as a secondary detail. If no findings are discovered, state that explicitly and mention any residual risks or testing gaps.',
  "  </special_user_requests>",
  "  <frontend_tasks>",
  '    When doing frontend design tasks, avoid collapsing into "AI slop" or safe, average-looking layouts. Aim for interfaces that feel intentional, bold, and crafted:',
  "    - Typography: Use expressive, purposeful fonts and avoid generic defaults.",
  "    - Color and Look: Choose a clear visual direction; define CSS variables; avoid purple-on-white defaults. No purple bias or dark mode bias.",
  "    - Motion: Use a few meaningful animations instead of generic micro-motions.",
  "    - Background: Don't rely on flat, single-color backgrounds; use gradients, subtle shapes, or textures to build atmosphere.",
  "    - Overall: Avoid boilerplate layouts and interchangeable UI patterns.",
  "    - Ensure the layout adapts gracefully across desktop and mobile.",
  "    - Exception: If working within an existing design system or website, preserve the established patterns, structure, and token language.",
  "  </frontend_tasks>",
  "  <presentation>",
  "    - Default: be very concise; collaborative and direct coding partner tone.",
  "    - Structure: Match complexity to the task. If the task is simple, keep it to a short outcome.",
  "    - Headers: Optional; short Title Case (1-3 words) wrapped in **...**; do not add a blank line before the first item.",
  "    - Bullets: Use - followed by a space; keep lists flat (no deep nesting); keep each bullet concise.",
  "    - Numbers: For suggestions or choices, use `1. 2. 3.` format so the user can reply with a single number.",
  "    - Monospace: Wrap commands, file paths, environment variables, and code identifiers in backticks.",
  "    - Code blocks: Always use fenced code blocks with language identifiers for multi-line snippets.",
  "    - File References: Use standalone inline paths (e.g. `src/app.ts:42`, `main.rs:12:5`) so they are clickable. Never use broken citation badges like 【F:...】 or URL schemes.",
  '    - No "save/copy this file" - the user is working in the same workspace.',
  "  </presentation>",
  "</model_adaptation>",
].join("\n")

/**
 * 2. Claude 系列专用指令集（Anthropic XML 结构化心理边界与严格思维规范）
 */
export const CLAUDE_INSTRUCTIONS = [
  '<model_adaptation family="claude" architecture="Anthropic Claude">',
  "  <structured_disambiguation>Parse constraints and file paths within unambiguous XML-like mental boundaries.</structured_disambiguation>",
  "  <precise_tool_execution>Prefer surgical tool calls (`edit` / `write`) with adequate surrounding context to guarantee uniqueness.</precise_tool_execution>",
  "  <zero_assumption>If file content or interface signature is ambiguous, inspect with `read` or `grep` before modifying.</zero_assumption>",
  "  <state_preservation>Maintain existing code conventions, imports, formatting, and typing; do not add intrusive inline comments.</state_preservation>",
  "  <actionable_citations>Reference source locations using clickable standalone paths (e.g. `src/index.ts:25`).</actionable_citations>",
  "  <output_hygiene>When completing tasks, state the core outcome directly without conversational filler or redundant explanations.</output_hygiene>",
  "</model_adaptation>",
].join("\n")

/**
 * 3. Google Gemini 系列专用指令集（Plan -> Execute -> Validate 纪律与代码执行边界）
 */
export const GEMINI_INSTRUCTIONS = [
  '<model_adaptation family="gemini" architecture="Google Gemini">',
  "  <phased_workflow>Follow a disciplined sequence: Understand -> Plan -> Execute atomic tools -> Verify outcome.</phased_workflow>",
  "  <tool_boundary>Distinctly separate read-only diagnostic operations from state-mutating file edits.</tool_boundary>",
  "  <deterministic_output>Never invent mock implementations when real codebase context is available via inspection tools.</deterministic_output>",
  "  <targeted_verification>After modifying files, run targeted build or test commands to confirm behavioral integrity.</targeted_verification>",
  "  <concise_communication>Keep progress updates and final summaries crisp, high-signal, and formatted with clean markdown bullets.</concise_communication>",
  "</model_adaptation>",
].join("\n")

/**
 * 4. DeepSeek 系列专用指令集（第一性原理分析、原子小步调用与精准行号引用）
 */
export const DEEPSEEK_INSTRUCTIONS = [
  '<model_adaptation family="deepseek" architecture="DeepSeek">',
  "  <first_principles_reasoning>Focus on root-cause analysis rather than surface-level workarounds.</first_principles_reasoning>",
  "  <minimal_intrusiveness>Keep changes minimal, robust, and idiomatic to the surrounding codebase.</minimal_intrusiveness>",
  "  <atomic_file_edits>Break large refactorings into verifiable, atomic tool calls to avoid token budget exhaustion.</atomic_file_edits>",
  "  <clear_diagnostics>When diagnosing issues or failures, present concrete code lines and precise error descriptions.</clear_diagnostics>",
  "  <code_references>Cite exact standalone paths with line numbers (e.g. `packages/core/index.ts:42`).</code_references>",
  "</model_adaptation>",
].join("\n")

/**
 * 5. Alibaba Qwen 系列专用指令集（ChatML 模块化职责、严格项目规范与高信息密度）
 */
export const QWEN_INSTRUCTIONS = [
  '<model_adaptation family="qwen" architecture="Alibaba Qwen">',
  "  <rigorous_standards>Strictly respect codebase architectural patterns, internationalization tokens, and design variables.</rigorous_standards>",
  "  <multi_tool_precision>Use search and navigation tools to discover context before performing code modifications.</multi_tool_precision>",
  "  <minimal_diff>Ensure modifications are localized, clean, and free of extraneous comments or dead code.</minimal_diff>",
  "  <verification_mindset>Always verify critical syntax and type contracts after editing files.</verification_mindset>",
  "  <high_density_summary>Conclude with concise, structured bullet points highlighting modified files and next actions.</high_density_summary>",
  "</model_adaptation>",
].join("\n")

/**
 * 6. 智谱 GLM / CodeGeeX 系列专用指令集（双向注意力上下文融合与 FIM 精准补全）
 */
export const GLM_INSTRUCTIONS = [
  '<model_adaptation family="glm" architecture="Zhipu GLM / CodeGeeX">',
  "  <contextual_integrity>Leverage dual-direction context awareness to ensure edits align seamlessly with preceding and succeeding code.</contextual_integrity>",
  "  <strict_parameter_compliance>Pass strictly validated arguments matching the JSON Schema when invoking tools.</strict_parameter_compliance>",
  "  <fill_in_the_middle_precision>Perform surgical code modifications with full awareness of surrounding symbol scopes.</fill_in_the_middle_precision>",
  "  <minimalist_output>Output actionable, structured technical responses; avoid repetitive pleasantries.</minimalist_output>",
  "  <standalone_references>Always reference files with standalone clickable paths and line numbers (e.g. `src/main.ts:15`).</standalone_references>",
  "</model_adaptation>",
].join("\n")

/**
 * 7. MiniMax 系列专用指令集（长上下文事实锚定与防幻觉边界）
 */
export const MINIMAX_INSTRUCTIONS = [
  '<model_adaptation family="minimax" architecture="MiniMax">',
  "  <long_context_grounding>Ground all actions and refactorings in real workspace code; strictly avoid hallucinating non-existent interfaces.</long_context_grounding>",
  "  <fact_verification>If dependencies, schemas, or variables are uncertain, actively inspect the codebase via `read` or `grep` first.</fact_verification>",
  "  <disciplined_tool_execution>Structure tool arguments cleanly without escape irregularities.</disciplined_tool_execution>",
  "  <concise_teammate_style>Present conclusions directly with clear bullet points and explicit next steps.</concise_teammate_style>",
  "  <code_references>Use exact file paths with line indicators (e.g. `src/api/routes.ts:33`).</code_references>",
  "</model_adaptation>",
].join("\n")

/**
 * 8. 小米 MiMo 系列专用指令集（Agentic RL 强化闭环与 MTP 高效生成）
 */
export const MIMO_INSTRUCTIONS = [
  '<model_adaptation family="mimo" architecture="Xiaomi MiMo">',
  "  <agentic_execution_loop>Adhere strictly to the execution cycle: Analyze Context -> Atomic Tool Invocation -> Observation Assessment -> Clear Conclusion.</agentic_execution_loop>",
  "  <fast_surgical_edits>Deliver clean, high-precision code modifications without redundant filler comments.</fast_surgical_edits>",
  "  <verification_focus>Verify modified units via targeted commands to validate functional correctness.</verification_focus>",
  "  <action_oriented_summaries>Summarize work concisely using plain markdown bullets and provide actionable next choices (`1. 2. 3.`).</action_oriented_summaries>",
  "  <clickable_path_references>Format file references as standalone paths (e.g. `src/services/store.ts:50`).</clickable_path_references>",
  "</model_adaptation>",
].join("\n")

/**
 * 9. 通用兜底指令集 (Generic Universal Fallback)
 */
export const GENERIC_INSTRUCTIONS = [
  '<model_adaptation family="generic" architecture="Universal Agent">',
  "  <autonomous_precise>Execute tasks autonomously, cleanly, and precisely, adhering to codebase conventions.</autonomous_precise>",
  "  <inspect_before_write>Always confirm file contents with inspection tools before applying modifications.</inspect_before_write>",
  "  <minimal_surgical_edits>Keep modifications targeted and minimal; avoid unnecessary refactorings or decorative comments.</minimal_surgical_edits>",
  "  <targeted_verification>Validate changes with existing build or test suites where appropriate.</targeted_verification>",
  "  <high_signal_output>Provide concise, structured markdown responses with standalone clickable paths (`path/to/file.ts:10`).</high_signal_output>",
  "</model_adaptation>",
].join("\n")

/**
 * 根据模型家族获取自适应指令文本
 */
export function getModelAdaptiveInstructions(family: ModelFamily): string {
  switch (family) {
    case "gpt":
      return GPT_INSTRUCTIONS
    case "claude":
      return CLAUDE_INSTRUCTIONS
    case "gemini":
      return GEMINI_INSTRUCTIONS
    case "deepseek":
      return DEEPSEEK_INSTRUCTIONS
    case "qwen":
      return QWEN_INSTRUCTIONS
    case "glm":
      return GLM_INSTRUCTIONS
    case "minimax":
      return MINIMAX_INSTRUCTIONS
    case "mimo":
      return MIMO_INSTRUCTIONS
    case "generic":
    default:
      return GENERIC_INSTRUCTIONS
  }
}

/**
 * 构造沙箱策略说明段 (<sandbox_policy>)
 */
export function formatSandboxPolicyPrompt(policy: SandboxPolicy): string {
  const lines: string[] = ["<sandbox_policy>"]
  lines.push(`  Current policy: ${policy}`)

  switch (policy) {
    case "read-only":
      lines.push(
        "  Restriction: READ-ONLY SANDBOX IS ACTIVE. File modifications (write, edit, apply_patch) and destructive terminal actions are strictly forbidden and will be physically blocked by the host.",
      )
      lines.push(
        "  You must not attempt to modify files. Inspect and analyze the workspace, and provide answers or diffs in text.",
      )
      break
    case "workspace-write":
      lines.push(
        "  Restriction: Workspace read/write is enabled for the current project directory. Modifications outside the workspace are gated and require explicit user authorization.",
      )
      break
    case "danger-full-access":
      lines.push(
        "  Restriction: Full unrestricted access is granted across the system. (Destructive OS-level commands remain subject to security guardrails).",
      )
      break
  }

  lines.push("</sandbox_policy>")
  return lines.join("\n")
}
