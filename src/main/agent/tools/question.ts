import type { QuestionAnswer, QuestionPrompt } from "@shared/contracts/agent"
import { z } from "zod"
import type { AgentTool } from "../core/types"

// 提问选项 schema。
const questionOptionSchema = z.object({
  label: z.string().min(1).max(100),
  description: z.string().max(200).optional(),
})

// 单个提问 schema。
const questionPromptSchema = z.object({
  question: z.string().min(1).max(500).describe("简短纯文本提问"),
  content: z
    .string()
    .min(1)
    .max(50000)
    .optional()
    .describe("附加图形化/排版内容（支持 SVG 矢量绘制与基础 HTML 结构），仅交互表单与详情展示"),
  header: z.string().max(12).optional().describe("短标签（≤12 字符）"),
  options: z.array(questionOptionSchema).min(2).max(4).optional().describe("选择题候选（2..4 个）"),
  multiSelect: z.boolean().optional().describe("是否多选（仅选择题生效）"),
})

// question 工具输入 schema。
const questionInputSchema = z.object({
  questions: z.array(questionPromptSchema).min(1).max(4),
})

// question 工具依赖（agentRunner 装配时注入；execute 时解析）。
export interface QuestionToolDeps {
  // 挂起等待用户作答；返回 null 表示用户未回答（dismiss/abort）。
  askQuestion: (
    questions: QuestionPrompt[],
    toolCallId: string,
    signal?: AbortSignal,
  ) => Promise<QuestionAnswer[] | null>
}

// 用户未回答的 error toolResult 文案（回灌模型，供其自行收尾）。
const QUESTION_DISMISSED_MESSAGE = "用户未回答该问题。"

// 答案回灌格式化（对齐 opencode）：`User answered: "q"="a1,a2". Continue with the answers.`
const formatAnswers = (answers: QuestionAnswer[]): string => {
  const parts = answers.map((item) => `"${item.question}"="${item.answer.join(",")}"`)
  return `User answered: ${parts.join(", ")}. Continue with the answers.`
}

/**
 * 创建 question 工具：模型执行中向用户提问（选择题或自由文本），答案作为 toolResult 回灌。
 *
 * 纯交互无副作用，归豁免集（EXEMPT_TOOLS）；executionMode: sequential 阻塞交互独占，
 * 避免与同批其它工具并发导致多面板并存。用户 dismiss/abort → 抛错 → error toolResult → 模型继续。
 */
export const createQuestionTool = (
  deps: QuestionToolDeps,
): AgentTool<typeof questionInputSchema, { answers: QuestionAnswer[] }> => ({
  name: "question",
  label: "提问",
  description:
    "向用户提问以澄清需求或确认选择。当信息不足以继续、需要用户在若干选项间做决定或补充说明时使用。" +
    "question 为简短纯文本提问；content 为可选图形化/排版内容（支持 SVG 矢量绘制、基础 HTML 结构与字符画拓扑）。" +
    "【深色主题规范】：LX Agent 为纯黑深色主题，SVG 必须使用透明背景（严禁输出白色/浅色背景底板），节点使用深色/半透明底色配亮色发光边框，文字与连线使用高亮对比色（如 #ffffff、#94a3b8、#38bdf8）。" +
    "options 提供选择题（可多选），缺省为自由文本输入。用户未作答时工具报错，据此调整或跳过。",
  inputSchema: questionInputSchema,
  executionMode: "sequential",
  execute: async (toolCallId, params, signal) => {
    const answers = await deps.askQuestion(params.questions, toolCallId, signal)
    if (answers === null || answers.length === 0) {
      throw new Error(QUESTION_DISMISSED_MESSAGE)
    }
    return {
      content: [{ type: "text", text: formatAnswers(answers) }],
      details: { answers },
    }
  },
})
