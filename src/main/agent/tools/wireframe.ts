import { z } from "zod"
import type { AgentTool } from "@/agent/core/types"

export interface WireframeToolDetails {
  title: string
  layout: string
  description?: string
}

/**
 * Creates the wireframe tool: records and formats an ASCII UI wireframe.
 *
 * Side-effect free session tool used to establish and review UI layouts
 * before creating or editing frontend code.
 */
export const createWireframeTool = (): AgentTool<
  z.ZodObject<{
    title: z.ZodString
    layout: z.ZodString
    description: z.ZodOptional<z.ZodString>
  }>,
  WireframeToolDetails
> => ({
  name: "wireframe",
  label: "ASCII Wireframe",
  description:
    "Record and present an ASCII wireframe layout using Unicode box-drawing characters for UI planning. Call this tool before creating or modifying frontend components, pages, or DOM structures to visualize and review layout hierarchy.",
  inputSchema: z.object({
    title: z.string().min(1).max(100).describe("Frontend page or component name"),
    layout: z
      .string()
      .min(1)
      .describe("ASCII wireframe diagram using Unicode box-drawing characters (┌ ─ ┐ │ └ ┘)"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Layout description, component hierarchy, responsive notes, or core interactions"),
  }),
  execute: async (_toolCallId, params) => {
    const lines = [`# Wireframe: ${params.title}`]
    if (params.description) {
      lines.push(`Description: ${params.description}`)
    }
    lines.push("```", params.layout, "```")

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: {
        title: params.title,
        layout: params.layout,
        description: params.description,
      },
    }
  },
})
