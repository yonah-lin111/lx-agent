/**
 * 模型家族自适应指令适配器 (Model Adapters)
 *
 * 对齐 OpenAI Codex (gpt-5.2-codex_prompt.md) 与业界前沿 Agent Harness 规范，
 * 针对不同模型架构（GPT-5/Codex、Claude、DeepSeek/Generic）注入定制化操作约束与格式规范。
 */

import type { SandboxPolicy } from "@shared/contracts/agent"

/** 支持的模型架构家族 */
export type ModelFamily = "gpt-5-codex" | "claude" | "deepseek" | "generic"

/**
 * 根据模型标识识别所属模型家族
 */
export function detectModelFamily(modelId?: string): ModelFamily {
  if (!modelId) return "generic"
  const normalized = modelId.toLowerCase()

  if (
    normalized.includes("codex") ||
    normalized.includes("gpt-5") ||
    normalized.includes("o1") ||
    normalized.includes("o3")
  ) {
    return "gpt-5-codex"
  }

  if (normalized.includes("claude")) {
    return "claude"
  }

  if (normalized.includes("deepseek") || normalized.includes("dsh")) {
    return "deepseek"
  }

  return "generic"
}

/**
 * GPT-5.2 Codex 专用指令集（完全对齐 codex-rs/core/gpt-5.2-codex_prompt.md）
 */
export const GPT_5_2_CODEX_INSTRUCTIONS = `## Editing constraints

- Default to ASCII when editing or creating files. Only introduce non-ASCII or other Unicode characters when there is a clear justification and the file already uses them.
- Add succinct code comments that explain what is going on if code is not self-explanatory. You should not add comments like "Assigns the value to the variable", but a brief comment might be useful ahead of a complex code block that the user would otherwise have to spend time parsing out. Usage of these comments should be rare.
- Try to use apply_patch for single file edits, but it is fine to explore other options (such as edit or write) if it does not work well.
- You may be in a dirty git worktree:
  * NEVER revert existing changes you did not make unless explicitly requested, since these changes were made by the user.
  * If asked to make a commit or code edits and there are unrelated changes to your work or changes that you didn't make in those files, don't revert those changes.
  * If the changes are in files you've touched recently, read carefully and understand how you can work with the changes rather than reverting them.
  * If the changes are in unrelated files, just ignore them and don't revert them.
- Do not amend a commit unless explicitly requested to do so.
- While working, if you notice unexpected changes that you didn't make, STOP IMMEDIATELY and ask the user how they would like to proceed.
- NEVER use destructive commands like \`git reset --hard\` or \`git checkout --\` unless specifically requested or approved by the user.
- Prefer non-interactive git commands over interactive ones.

## Special user requests

- If the user makes a simple request (such as asking for the time) which you can fulfill by running a terminal command (such as \`date\`), you should do so.
- If the user asks for a "review", default to a code review mindset: prioritize identifying bugs, risks, behavioural regressions, and missing tests. Present findings first (ordered by severity with file/line references), follow with open questions or assumptions, and offer a change-summary only as a secondary detail. If no findings are discovered, state that explicitly and mention any residual risks or testing gaps.

## Frontend tasks

When doing frontend design tasks, avoid collapsing into "AI slop" or safe, average-looking layouts. Aim for interfaces that feel intentional, bold, and crafted:
- Typography: Use expressive, purposeful fonts and avoid generic defaults.
- Color & Look: Choose a clear visual direction; define CSS variables; avoid purple-on-white defaults. No purple bias or dark mode bias.
- Motion: Use a few meaningful animations instead of generic micro-motions.
- Background: Don't rely on flat, single-color backgrounds; use gradients, subtle shapes, or textures to build atmosphere.
- Overall: Avoid boilerplate layouts and interchangeable UI patterns.
- Ensure the layout adapts gracefully across desktop and mobile.
- Exception: If working within an existing design system or website, preserve the established patterns, structure, and token language.

## Presenting your work and final message

- Default: be very concise; collaborative and direct coding partner tone.
- Structure: Match complexity to the task. If the task is simple, keep it to a short outcome.
- Headers: Optional; short Title Case (1-3 words) wrapped in **...**; do not add a blank line before the first item.
- Bullets: Use - followed by a space; keep lists flat (no deep nesting); keep each bullet concise.
- Numbers: For suggestions or choices, use \`1. 2. 3.\` format so the user can reply with a single number.
- Monospace: Wrap commands, file paths, environment variables, and code identifiers in backticks.
- Code blocks: Always use fenced code blocks with language identifiers for multi-line snippets.
- File References: Use standalone inline paths (e.g. \`src/app.ts:42\`, \`main.rs:12:5\`) so they are clickable. Never use broken citation badges like 【F:...】 or URL schemes.
- No "save/copy this file" - the user is working in the same workspace.`.trim()

/**
 * Claude 系列专用指令集（强调严谨思维与工具链规范）
 */
export const CLAUDE_INSTRUCTIONS = `## Operational Guidelines

- Think carefully before acting: formulate a concise plan before complex refactoring or multi-file edits.
- Maintain minimal surgical edits: preserve existing code style, imports, formatting, and naming conventions.
- Never add unnecessary explanatory comments to generated code unless specifically requested.
- When referencing files in responses, use clickable single paths with line numbers (e.g. \`src/index.ts:25\`).
- If uncertain about file contents or context, inspect the relevant files with read or grep before modifying.`.trim()

/**
 * DeepSeek / Generic 通用指令集
 */
export const GENERIC_INSTRUCTIONS = `## Execution Standards

- Execute tasks autonomously and precisely, adhering to codebase conventions.
- Confirm file contents before editing and verify results using existing build/test tools where appropriate.
- Keep final responses concise, structured, and actionable.
- Format file citations as standalone inline paths (e.g. \`path/to/file.ts:10\`).`.trim()

/**
 * 根据模型家族获取自适应指令文本
 */
export function getModelAdaptiveInstructions(family: ModelFamily): string {
  switch (family) {
    case "gpt-5-codex":
      return GPT_5_2_CODEX_INSTRUCTIONS
    case "claude":
      return CLAUDE_INSTRUCTIONS
    case "deepseek":
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
