import type { CollaborationMode } from "@shared/contracts/agent"
import { z } from "zod"
import type { AgentTool } from "../core/types"

const SWITCH_MODE_INPUT_SCHEMA = z.object({
  mode: z
    .enum(["default", "plan"])
    .describe(
      "The target collaboration mode. Use 'plan' when entering exploratory architecture planning or multi-step design. Use 'default' when switching back to code execution.",
    ),
  reason: z
    .string()
    .describe(
      "Brief justification for switching modes (e.g., 'Planning complex architecture' or 'Plan approved, starting execution')",
    ),
})

export interface SwitchModeDeps {
  onSwitchMode: (mode: CollaborationMode) => void
  getCurrentMode?: () => CollaborationMode
}

/**
 * 切换 Agent 协作模式（Default / Plan Mode）
 */
export const createSwitchModeTool = (
  deps: SwitchModeDeps,
): AgentTool<typeof SWITCH_MODE_INPUT_SCHEMA> => {
  return {
    name: "switch_mode",
    label: "Switch Collaboration Mode",
    description:
      "Switch between 'plan' (strict non-mutating planning) and 'default' (action and code execution) modes. " +
      "Use 'plan' when the user asks for a plan, architecture design, or before major refactors. " +
      "Call 'switch_mode' with mode='default' IMMEDIATELY once the plan formulation is completed so that subsequent user requests can execute without friction.",
    inputSchema: SWITCH_MODE_INPUT_SCHEMA,
    execute: async (_toolCallId, params) => {
      deps.onSwitchMode(params.mode)
      return {
        content: [
          {
            type: "text",
            text: `Successfully switched collaboration mode to '${params.mode}'. Reason: ${params.reason}`,
          },
        ],
      }
    },
  }
}
