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

// 结构化表格工具输入 schema。
const renderTableInputSchema = z.object({
  html: z
    .string()
    .min(1)
    .max(50000)
    .describe("HTML 结构化表格源码（<table><thead>...</thead><tbody>...</tbody></table>）"),
  title: z.string().max(100).optional().describe("表格标题（选填，如'技术方案多维对比矩阵'）"),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe("伴随的 Markdown 说明文本，用于阐明对比结论与选型建议（选填）"),
})

/**
 * 创建 render_svg 工具：输出高表现力的 SVG 矢量图表（架构图、时序图、复杂拓扑）。
 */
export const createRenderSvgTool = (): AgentTool<typeof renderSvgInputSchema> => ({
  name: "render_svg",
  label: "SVG 矢量绘图",
  description:
    "渲染专业高表现力的 SVG 矢量技术图表（如系统架构拓扑、复杂交互时序、状态机、多层网络关系等）。\n" +
    "【适用场景】：需要精确几何节点、丰富配色与连线指向的复杂视觉架构展示。\n" +
    "【与其它工具区别】：相比 render_ascii 支持复杂几何曲线与丰富色彩；相比 render_table 专注于拓扑连线与空间布局而非多列数据对比。\n" +
    "【深色主题规范】：LX Agent 为纯黑深色主题，SVG 必须使用透明背景（严禁使用白色底板），节点使用深色/半透明底色配高亮发光边框，文字与连线使用高亮对比色（如 #ffffff、#94a3b8、#38bdf8）。",
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
    "【与其它工具区别】：相比 render_svg 更加紧凑极速，具备原生终端质感；相比 render_table 专注于流转指向与层次关系而非多列对比。",
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
 * 创建 render_table 工具：输出结构化 HTML 对比表格与数据矩阵。
 */
export const createRenderTableTool = (): AgentTool<typeof renderTableInputSchema> => ({
  name: "render_table",
  label: "结构化表格",
  description:
    "渲染适配深色主题的 HTML 结构化表格（如方案优缺点对比、多维度指标矩阵、API 接口清单、配置对照表）。\n" +
    "【适用场景】：需要多列对齐、表头分类、多指标评估的规整数据矩阵。\n" +
    "【与其它工具区别】：相比 render_svg / render_ascii 专注于多字段对齐与矩阵对比，而非图形化流转关系。",
  inputSchema: renderTableInputSchema,
  execute: async (_, params) => ({
    content: [
      {
        type: "text",
        text: `已成功渲染结构化表格${params.title ? `「${params.title}」` : ""}。`,
      },
    ],
  }),
})
