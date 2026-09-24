import type { CollaborationMode } from "@shared/contracts/agent"
import { SWITCH_MODE_TARGETS } from "@shared/contracts/agent"
import { z } from "zod"
import type { AgentTool } from "../core/types"

// switch_mode 工具输入：目标模式 + 简短理由（审计与调试用）。
const SWITCH_MODE_INPUT_SCHEMA = z.object({
  mode: z
    .enum(SWITCH_MODE_TARGETS)
    .describe(
      "Target collaboration mode: 'plan' (design before implementing), 'review' (read-only audit), 'design' (front-end prototyping), 'build' (execute).",
    ),
  reason: z
    .string()
    .optional()
    .describe(
      "Brief justification for the switch (e.g., 'multi-file refactor needs a decision-complete plan')",
    ),
})

// switch_mode 工具依赖（仅 auto 编排基础模式装配时注入）。
export interface SwitchModeDeps {
  // 当前基础模式（非 auto 时工具拒绝执行）。
  getBaseMode: () => CollaborationMode
  // 当前有效模式。
  getEffectiveMode: () => CollaborationMode
  // 切换有效模式（落 mode_change 条目并广播，状态栏与流程视图可见）。
  switchEffectiveMode: (mode: CollaborationMode) => { ok: true } | { ok: false; error: string }
  // 允许切换的目标模式列表（缺省全量 SWITCH_MODE_TARGETS）。
  getAllowedTargets?: () => readonly (typeof SWITCH_MODE_TARGETS)[number][]
}

// 切换后的即时确认信息（系统提示词同轮立即同步重构生效）。
const MODE_SWITCH_GUIDANCE: Record<(typeof SWITCH_MODE_TARGETS)[number], string> = {
  plan: "Switched to Plan Mode (strictly read-only). System prompt updated to Plan Mode contract (<proposed_plan>). Mutating tools are now hard-blocked.",
  review:
    "Switched to Review Mode (strictly read-only audit). System prompt updated to Review Mode contract (<review_findings>). Mutating tools are now hard-blocked.",
  design:
    "Switched to Front Design Mode (read-only prototyping). System prompt updated to Front Design contract (<front_design>). Pure runnable HTML required; mutating tools and wireframe are hard-blocked.",
  build: "Switched to Build Mode. Execution is enabled: proceed with implementation.",
}

/**
 * switch_mode 工具（仅 auto 编排基础模式可用）：模型按自动编排策略自行切换有效模式。
 *
 * 切换即时生效并落 mode_change 条目（viaAuto）供审计；用户可在状态栏随时改回。
 * 退出只读模式由模型在用户批准后自行完成（提示词约束：不得在展示计划的同一轮切回 build）。
 */
export const createSwitchModeTool = (
  deps: SwitchModeDeps,
): AgentTool<typeof SWITCH_MODE_INPUT_SCHEMA> => ({
  name: "switch_mode",
  label: "Switch Mode",
  description: [
    "Switch the collaboration mode of this session (Auto orchestration).",
    "Use 'plan' before implementing work that spans multiple files, introduces architecture/API/schema decisions, has ambiguous requirements, or is risky to reverse; deliver the plan strictly inside <proposed_plan> and end your turn.",
    "Use 'review' for read-only audits and verification passes (deliver <review_findings>).",
    'Use \'design\' for front-end UI prototypes; you MUST deliver a complete runnable HTML document inside <front_design title="..." mode="tailwindcss|css"> (never output Markdown or documentation inside it).',
    "Use 'build' to resume execution after the user approves the plan or design; never switch back to build in the same turn you presented the plan.",
    "Do not switch for small, clear, low-risk changes — stay in the current mode.",
  ].join(" "),
  inputSchema: SWITCH_MODE_INPUT_SCHEMA,
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    const baseMode = deps.getBaseMode()
    if (baseMode !== "auto") {
      return {
        content: [
          {
            type: "text",
            text: "switch_mode is only available in Auto Mode. The current session has an explicitly selected collaboration mode.",
          },
        ],
      }
    }

    const currentMode = deps.getEffectiveMode()
    const target = params.mode
    if (target === currentMode) {
      return {
        content: [{ type: "text", text: `Already in '${currentMode}' mode.` }],
      }
    }

    const allowedTargets = deps.getAllowedTargets?.() ?? SWITCH_MODE_TARGETS
    if (!allowedTargets.includes(target)) {
      return {
        content: [
          {
            type: "text",
            text: `Mode '${target}' is disabled in settings. You cannot switch to it. Available modes: ${allowedTargets.join(", ")}.`,
          },
        ],
      }
    }

    const result = deps.switchEffectiveMode(target)
    if (!result.ok) {
      return { content: [{ type: "text", text: result.error }] }
    }
    return { content: [{ type: "text", text: MODE_SWITCH_GUIDANCE[target] }] }
  },
})
