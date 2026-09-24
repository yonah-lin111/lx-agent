import type { CollaborationMode } from "@shared/contracts/agent"
import { isReadOnlyEffectiveMode, SWITCH_MODE_TARGETS } from "@shared/contracts/agent"
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
  // 切换有效模式（落 mode_change 条目并广播）。
  switchEffectiveMode: (mode: CollaborationMode) => { ok: true } | { ok: false; error: string }
  // 只读有效模式退出审批（renderer 内联确认块；返回 false = 拒绝）。
  requestExitApproval: (input: {
    toolCallId: string
    fromMode: CollaborationMode
  }) => Promise<boolean>
}

// 切换后的即时引导（系统提示词在下一轮才重建，本轮靠工具结果同步契约）。
const MODE_SWITCH_GUIDANCE: Record<(typeof SWITCH_MODE_TARGETS)[number], string> = {
  plan: [
    "Switched to Plan Mode (strictly read-only).",
    "Explore first with read-only tools, then deliver a decision-complete plan inside <proposed_plan> tags and end your turn for user approval.",
    "Mutating tools (write, edit, apply_patch, todowrite, memory) are now hard-blocked; exiting back to build requires the user's approval.",
  ].join(" "),
  review: [
    "Switched to Review Mode (strictly read-only audit).",
    "Inspect the requested target (default: current uncommitted changes) and output structured findings inside <review_findings> tags.",
    "Mutating tools are now hard-blocked; exiting back to build requires the user's approval.",
  ].join(" "),
  design: [
    "Switched to Front Design Mode (read-only prototyping).",
    "Deliver the prototype inside <front_design> tags; the wireframe tool is disabled.",
    "Mutating tools are now hard-blocked; exiting back to build requires the user's approval.",
  ].join(" "),
  build:
    "Switched to Build Mode. Execution is enabled: proceed with implementation and verify the result.",
}

// 拒绝对话框后的回执（引导模型留在原模式等待用户）。
const declinedExitMessage = (fromMode: CollaborationMode): string =>
  [
    `The user declined to exit ${fromMode} Mode back to build.`,
    `Remain in ${fromMode} Mode and continue improving the current deliverable, or wait for the user's explicit instruction.`,
    'Do not call switch_mode("build") again in this turn.',
  ].join(" ")

/**
 * switch_mode 工具（仅 auto 编排基础模式可用）：模型按自动编排策略切换自身有效模式。
 *
 * 进入只读模式（plan / review / design）即时生效；退出只读模式回 build 必须经用户确认对话框
 * （renderer 内联确认块）批准，拒绝时保持原模式并返回引导。
 */
export const createSwitchModeTool = (
  deps: SwitchModeDeps,
): AgentTool<typeof SWITCH_MODE_INPUT_SCHEMA> => ({
  name: "switch_mode",
  label: "Switch Mode",
  description: [
    "Switch the collaboration mode of this session (Auto orchestration).",
    "Use 'plan' before implementing work that spans multiple files, introduces architecture/API/schema decisions, has ambiguous requirements, or is risky to reverse; deliver the plan with <proposed_plan> and end your turn.",
    "Use 'review' for read-only audits and verification passes (deliver <review_findings>); use 'design' for front-end prototypes (deliver <front_design>).",
    "Use 'build' to resume execution after the user approves a plan or design; this prompts the user for confirmation before leaving a read-only mode.",
    "Do not switch for small, clear, low-risk changes — stay in the current mode.",
  ].join(" "),
  inputSchema: SWITCH_MODE_INPUT_SCHEMA,
  executionMode: "sequential",
  execute: async (toolCallId, params) => {
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

    // 退出只读有效模式：必须经用户批准（拒绝或撤销均视为拒绝）。
    if (target === "build" && isReadOnlyEffectiveMode(currentMode)) {
      const allowed = await deps.requestExitApproval({
        toolCallId,
        fromMode: currentMode,
      })
      if (!allowed) {
        return { content: [{ type: "text", text: declinedExitMessage(currentMode) }] }
      }
    }

    const result = deps.switchEffectiveMode(target)
    if (!result.ok) {
      return { content: [{ type: "text", text: result.error }] }
    }
    return { content: [{ type: "text", text: MODE_SWITCH_GUIDANCE[target] }] }
  },
})
