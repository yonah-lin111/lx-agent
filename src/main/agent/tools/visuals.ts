import { z } from "zod"
import type { AgentTool } from "../core/types"

// SVG diagram tool input schema.
const renderSvgInputSchema = z.object({
  svg: z.string().min(1).max(50000).describe("SVG vector graphic source code (<svg>...</svg>)"),
  style: z
    .string()
    .max(2000)
    .optional()
    .describe("Optional custom CSS rules for SVG (e.g. '.node { fill: #38bdf8; }')"),
})

// ASCII / Box-drawing diagram tool input schema.
const renderAsciiInputSchema = z.object({
  ascii: z
    .string()
    .min(1)
    .max(50000)
    .describe("ASCII or Unicode Box-drawing diagram content (using ┌ ─ │ └ characters)"),
})

// HTML prototype tool input schema (MANDATORY Tailwind CSS).
const renderHtmlInputSchema = z.object({
  html: z
    .string()
    .min(1)
    .max(50000)
    .describe(
      "HTML source code styled EXCLUSIVELY with Tailwind CSS utility classes (e.g. class='flex flex-col gap-4 bg-zinc-900 text-white rounded-2xl p-6 shadow-xl border border-zinc-800'). Do NOT use <style> tags or inline style attributes; rely 100% on Tailwind CSS classes.",
    ),
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
 * Create render_html tool: outputs concise frontend prototypes and UI drafts using Tailwind CSS exclusively.
 */
export const createRenderHtmlTool = (): AgentTool<typeof renderHtmlInputSchema> => ({
  name: "render_html",
  label: "HTML Prototype",
  description:
    "Render concise HTML frontend prototypes, UI drafts, and interactive mockups.\n" +
    "[MANDATORY STYLING RULE]: MUST use Tailwind CSS utility classes exclusively on HTML elements (e.g. flex, grid, gap-4, bg-zinc-900, p-6, rounded-2xl, shadow-lg, text-white, border-zinc-800). STRICTLY PROHIBITED: Do not write <style> tags, external CSS, or inline style attributes. Rely 100% on Tailwind CSS utility classes.\n" +
    "[Primary Purpose]: Design and display concise frontend UI prototypes, interactive drafts, component views, and data tables.\n" +
    "[Usage]: Pass the html source directly with Tailwind CSS utility classes.",
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
