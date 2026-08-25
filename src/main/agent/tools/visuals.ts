import { z } from "zod"
import type { AgentTool } from "../core/types"

// SVG 绘图工具输入 schema。
const renderSvgInputSchema = z.object({
  svg: z.string().min(1).max(50000).describe("SVG 矢量图源码（<svg viewBox=...>...</svg>）"),
  title: z.string().max(100).optional().describe("图表标题（选填，如'系统数据流架构拓扑'）"),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("伴随的 Markdown 说明文本，用于阐述架构要点或技术细节（选填）"),
})

// 字符图案拓扑工具输入 schema。
const renderAsciiInputSchema = z.object({
  ascii: z
    .string()
    .min(1)
    .max(50000)
    .describe("ASCII 或 Box-drawing 字符画内容（使用 ┌ ─ │ └ 等标准字符对齐）"),
  title: z.string().max(100).optional().describe("图表标题（选填，如'CI/CD 构建流水线'）"),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("伴随的 Markdown 说明文本，用于解释流程步骤或关键节点（选填）"),
})

// HTML 结构化内容渲染工具输入 schema。
const renderHtmlInputSchema = z.object({
  html: z
    .string()
    .min(1)
    .max(50000)
    .describe(
      "HTML 结构化源码（支持表格 <table>、排版 <div>/<p>、列表 <ul>/<ol>、代码块 <pre> 等基础结构）",
    ),
  title: z.string().max(100).optional().describe("标题（选填，如'技术方案多维对比矩阵'）"),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("伴随的 Markdown 说明文本，用于阐明分析结论与选型建议（选填）"),
})

/**
 * 创建 render_svg 工具：输出高表现力的 SVG 矢量图表（架构图、时序图、复杂拓扑）。
 */
export const createRenderSvgTool = (): AgentTool<typeof renderSvgInputSchema> => ({
  name: "render_svg",
  label: "SVG 矢量绘图",
  description:
    "渲染高表现力的 SVG 矢量技术图表（如系统架构拓扑、复杂交互时序、状态机、多层网络关系等）。\n" +
    "【适用场景】：需要精确几何节点、连线指向与丰富视觉表现的图表展示。\n" +
    "【与其它工具区别】：相比 render_ascii 支持任意几何曲线与色彩；相比 render_html 专注于空间拓扑连线而非文本排版与多列数据对齐。",
  inputSchema: renderSvgInputSchema,
  execute: async (_, params) => ({
    content: [
      {
        type: "text",
        text: `已成功渲染 SVG 矢量图表${params.title ? `「${params.title}」` : ""}。`,
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
    "【适用场景】：单向流转（CI/CD 流水线、Git 分支图、数据管道）或目录树形结构。\n" +
    "【与其它工具区别】：相比 render_svg 更加紧凑极速，具备原生终端质感；相比 render_html 专注于流转指向与层次关系而非排版布局。",
  inputSchema: renderAsciiInputSchema,
  execute: async (_, params) => ({
    content: [
      {
        type: "text",
        text: `已成功渲染字符画拓扑${params.title ? `「${params.title}」` : ""}。`,
      },
    ],
  }),
})

/**
 * 创建 render_html 工具：输出结构化 HTML 内容（表格、卡片、对比矩阵与富文本排版）。
 */
export const createRenderHtmlTool = (): AgentTool<typeof renderHtmlInputSchema> => ({
  name: "render_html",
  label: "HTML 结构化渲染",
  description:
    "渲染基础 HTML 结构化排版内容（如多方案对比表格、指标矩阵、API 接口清单、卡片式多字段展示等）。\n" +
    "【适用场景】：需要多列规整对齐、表头分类、图文并茂或分栏排版的内容展示。\n" +
    "【与其它工具区别】：相比 render_svg / render_ascii 专注于多字段对齐与结构化内容排版，而非几何连线与拓扑指向。",
  inputSchema: renderHtmlInputSchema,
  execute: async (_, params) => ({
    content: [
      {
        type: "text",
        text: `已成功渲染 HTML 结构化内容${params.title ? `「${params.title}」` : ""}。`,
      },
    ],
  }),
})
