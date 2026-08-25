import { z } from "zod"
import type { AgentTool } from "../core/types"

// SVG diagram tool input schema.
const renderSvgInputSchema = z.object({
  svg: z.string().min(1).max(50000).describe("SVG vector graphic source code (<svg>...</svg>)"),
  style: z
    .string()
    .max(2000)
    .optional()
    .describe("Custom CSS style rules (optional, e.g. '.node { fill: #38bdf8; }')"),
})

// ASCII / Box-drawing diagram tool input schema.
const renderAsciiInputSchema = z.object({
  ascii: z
    .string()
    .min(1)
    .max(50000)
    .describe("ASCII or Unicode Box-drawing diagram content (using ┌ ─ │ └ characters)"),
})

// HTML prototype & structured rendering tool input schema.
const renderHtmlInputSchema = z.object({
  html: z
    .string()
    .min(1)
    .max(50000)
    .describe(
      "HTML source code (supports full HTML tags: button, input, select, form, card, table, nav, flex/grid layouts, etc., for building frontend prototypes, UI drafts, and component views)",
    ),
  style: z
    .string()
    .max(2000)
    .optional()
    .describe("Custom CSS style rules (optional, e.g. '.card { display: flex; gap: 8px; }')"),
})

/**
 * Create render_svg tool: outputs SVG vector diagrams (architecture, sequence, topology).
 */
export const createRenderSvgTool = (): AgentTool<typeof renderSvgInputSchema> => ({
  name: "render_svg",
  label: "SVG Vector Diagram",
  description:
    "Render SVG vector diagrams (system architecture topology, service sequence diagrams, state machines, data flow charts, etc.).\n" +
    "[Usage]: Pass the svg string directly; optionally pass a style string to define custom CSS. Rendered with a dark theme background by default.",
  inputSchema: renderSvgInputSchema,
  execute: async () => ({
    content: [
      {
        type: "text",
        text: "SVG vector diagram rendered successfully.",
      },
    ],
  }),
})

/**
 * Create render_ascii tool: outputs terminal-native ASCII / Box-drawing diagrams.
 */
export const createRenderAsciiTool = (): AgentTool<typeof renderAsciiInputSchema> => ({
  name: "render_ascii",
  label: "ASCII Diagram",
  description:
    "Render terminal-native ASCII / Unicode Box-drawing flowcharts, tree topologies, or lightweight branch workflows.\n" +
    "[Usage]: Pass the ascii diagram string directly. Rendered with monospace font and dark terminal background by default.",
  inputSchema: renderAsciiInputSchema,
  execute: async () => ({
    content: [
      {
        type: "text",
        text: "ASCII diagram rendered successfully.",
      },
    ],
  }),
})

/**
 * Create render_html tool: outputs concise frontend prototypes, UI drafts, and structured components.
 */
export const createRenderHtmlTool = (): AgentTool<typeof renderHtmlInputSchema> => ({
  name: "render_html",
  label: "HTML Prototype",
  description:
    "Render concise HTML frontend prototypes, UI drafts, and structured layouts (supports form controls, buttons, cards, navbars, grid/flex layouts, tables, and full HTML tags with styles).\n" +
    "[Primary Purpose]: Design and display concise frontend UI prototypes, interactive drafts, component views, and data matrices.\n" +
    "[Usage]: Pass the html source directly (supports form, input, button, select, div, table, etc.); optionally pass custom style rules. Rendered in an isolated dark theme by default.",
  inputSchema: renderHtmlInputSchema,
  execute: async () => ({
    content: [
      {
        type: "text",
        text: "HTML prototype rendered successfully.",
      },
    ],
  }),
})
