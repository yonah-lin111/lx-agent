import { z } from "zod"
import type { AgentTool } from "../core/types"

// SVG 绘图工具输入 schema。
const renderSvgInputSchema = z.object({
  svg: z.string().min(1).max(50000).describe("SVG 矢量图源码（<svg>...</svg>）"),
  style: z
    .string()
    .max(2000)
    .optional()
    .describe("自定义 CSS 样式规则（选填，如 '.node { fill: #38bdf8; }'）"),
})

// 字符图案拓扑工具输入 schema。
const renderAsciiInputSchema = z.object({
  ascii: z
    .string()
    .min(1)
    .max(50000)
    .describe("ASCII 或 Box-drawing 字符画内容（使用 ┌ ─ │ └ 等标准字符对齐）"),
})

// HTML 原型与结构化渲染工具输入 schema。
const renderHtmlInputSchema = z.object({
  html: z
    .string()
    .min(1)
    .max(50000)
    .describe(
      "HTML 源码（支持完整 HTML 标签体系：button、input、select、form、card、table、nav、flex/grid 布局等，用于快速构建前端原型草稿与界面组件）",
    ),
  style: z
    .string()
    .max(2000)
    .optional()
    .describe("自定义 CSS 样式规则（选填，如 '.card { display: flex; gap: 8px; }'）"),
})

/**
 * 创建 render_svg 工具：输出 SVG 矢量图表（架构图、时序图、拓扑关系）。
 */
export const createRenderSvgTool = (): AgentTool<typeof renderSvgInputSchema> => ({
  name: "render_svg",
  label: "SVG 矢量绘图",
  description:
    "渲染 SVG 矢量图表（如系统架构拓扑、服务时序交互、状态机、数据流图等）。\n" +
    "【使用说明】：直接传入 svg 字符串；支持传入 style 字符串设置自定义样式。默认采用黑色主题背景展示。",
  inputSchema: renderSvgInputSchema,
  execute: async () => ({
    content: [
      {
        type: "text",
        text: "已成功渲染 SVG 矢量图表。",
      },
    ],
  }),
})

/**
 * 创建 render_ascii 工具：输出终端原生质感的 ASCII / Box-drawing 字符流转图。
 */
export const createRenderAsciiTool = (): AgentTool<typeof renderAsciiInputSchema> => ({
  name: "render_ascii",
  label: "字符画拓扑",
  description:
    "渲染终端原生质感的 ASCII / Unicode Box-drawing 字符流转图、树形拓扑或轻量分支流程。\n" +
    "【使用说明】：直接传入 ascii 字符画内容。默认采用等宽字体与黑色终端主题背景展示。",
  inputSchema: renderAsciiInputSchema,
  execute: async () => ({
    content: [
      {
        type: "text",
        text: "已成功渲染字符画拓扑。",
      },
    ],
  }),
})

/**
 * 创建 render_html 工具：输出前端原型、UI 草稿、结构化内容与自定义样式。
 */
export const createRenderHtmlTool = (): AgentTool<typeof renderHtmlInputSchema> => ({
  name: "render_html",
  label: "HTML 原型与排版",
  description:
    "渲染 HTML 前端原型草稿与结构化内容（支持各类表单控件、按钮、卡片、导航栏、网格布局、对比表格等完整标签体系与样式）。\n" +
    "【核心作用】：设计和展示简洁的前端界面原型、交互草稿、UI 视图组件及数据报表。\n" +
    "【使用说明】：直接传入 html 源码（支持 form、input、button、select、div、table 等各类标签）；支持传入 style 设置自定义 CSS 样式规则。默认采用黑色主题隔离展示，不受全局样式污染。",
  inputSchema: renderHtmlInputSchema,
  execute: async () => ({
    content: [
      {
        type: "text",
        text: "已成功渲染 HTML 前端原型与结构化内容。",
      },
    ],
  }),
})
