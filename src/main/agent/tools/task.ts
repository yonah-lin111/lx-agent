import { randomUUID } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { AgentMessage, AssistantMessage, TextContent, Usage } from "@shared/contracts/agent"
import { z } from "zod"
import { getAppDataRoot } from "@/paths"
import { Agent } from "../core/agent"
import type { AgentTool, BeforeToolCallContext, BeforeToolCallResult, Model } from "../core/types"
import { createAiSdkStreamFn } from "../stream/aiSdkStreamFn"
import { DEFAULT_MAX_BYTES, formatSize, truncateTail } from "./truncate"

// 子代理系统提示词后缀（追加在父系统提示词之后）。
const SUBAGENT_PROMPT_SUFFIX = [
  "你现在是子代理，专注完成被委托的独立子任务。",
  "只使用完成该任务必要的工具；达成目标后立即停止，用简体中文简要总结结果。",
  "不要执行任务范围之外的多余探索。",
].join("\n")

// 子代理最终输出超限阈值（写 tool-output 文件，父上下文只收有界预览 + 路径标记）。
const SUBAGENT_MAX_BYTES = DEFAULT_MAX_BYTES

// task 工具输入 schema。
const TASK_INPUT_SCHEMA = z.object({
  description: z.string().min(1).max(500).describe("子任务说明（供父模型判断是否适合委托）"),
  prompt: z.string().min(1).max(4000).describe("委托给子代理的任务文本"),
})

// 子代理执行细节（UI/审计用，不进模型上下文）。
interface SubagentDetails {
  usage: Usage
  messageCount: number
  filePath?: string
}

// task 工具依赖（agentRunner 装配时注入；execute 时解析）。
export interface TaskToolDeps {
  // 父系统提示词（子代理在其后追加子代理前缀）。
  systemPrompt: string
  // 父会话模型（子代理沿用）。
  model: Model
  // 父权限门控（子代理内部工具复用同一 permissionManager.gate，不豁免）。
  beforeToolCall: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  // 父 run 的 abort signal（级联中止子代理）。
  getSignal: () => AbortSignal | undefined
}

// 子代理最终文本有界化：未超限原样返回；超限截断 + 完整内容写 tool-output 文件。
const boundSubagentOutput = (text: string): { content: string; filePath?: string } => {
  const truncated = truncateTail(text, { maxBytes: SUBAGENT_MAX_BYTES })
  if (!truncated.truncated) return { content: text }
  const filePath = join(getAppDataRoot(), "tool-output", `subagent-${randomUUID()}.txt`)
  mkdirSync(join(getAppDataRoot(), "tool-output"), { recursive: true })
  writeFileSync(filePath, text, "utf8")
  const marker = `\n\n[输出超限（${formatSize(truncated.totalBytes)}），完整结果已写入 ${filePath}]`
  return { content: `${truncated.content}${marker}`, filePath }
}

// 提取子代理上下文的全部助手文本（最终输出）与错误信息。
const extractSubagentResult = (messages: AgentMessage[]): { text: string; error?: string } => {
  const text = messages
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      message.content
        .filter((block): block is TextContent => block.type === "text")
        .map((block) => block.text),
    )
    .filter(Boolean)
    .join("\n\n")
  const error = messages
    .filter(
      (message): message is AssistantMessage =>
        message.role === "assistant" && message.errorMessage !== undefined,
    )
    .map((message) => message.errorMessage)
    .filter((value): value is string => Boolean(value))
    .at(-1)
  return { text, error }
}

// 聚合子代理全部助手消息的 token 用量（审计/展示用）。
const aggregateUsage = (messages: AgentMessage[]): Usage => {
  return messages
    .filter((message) => message.role === "assistant")
    .reduce<Usage>(
      (total, message) => ({
        input: total.input + message.usage.input,
        output: total.output + message.usage.output,
        totalTokens: total.totalTokens + message.usage.totalTokens,
      }),
      { input: 0, output: 0, totalTokens: 0 },
    )
}

/**
 * 创建 task 工具：委托独立子任务到进程内嵌套 Agent。
 *
 * 子代理在同一 cwd 内以独立上下文运行自己的工具循环（复用父权限门控），
 * 流式文本经 onUpdate 桥接回父工具（renderer 经 tool_execution_update 展示进度），
 * 最终文本有界回传；父 run abort 级联中止子代理。
 */
export const createTaskTool = (
  deps: TaskToolDeps & { getTools: () => AgentTool<any>[] },
): AgentTool<typeof TASK_INPUT_SCHEMA> => {
  const subAgentPrompt = `${deps.systemPrompt}\n\n${SUBAGENT_PROMPT_SUFFIX}`

  return {
    name: "task",
    label: "子代理",
    description:
      "委托一个独立子任务给子代理（如并行搜索、独立探索、长命令执行）。" +
      "子代理在独立上下文中运行自己的工具循环，最终文本作为结果返回。" +
      "当任务可分解为互不依赖的子任务时使用；需要父上下文决策的任务不要委托。",
    inputSchema: TASK_INPUT_SCHEMA,
    execute: async (_toolCallId, params, signal, onUpdate) => {
      const subAgent = new Agent({
        streamFn: createAiSdkStreamFn(),
        beforeToolCall: deps.beforeToolCall,
        initialState: {
          systemPrompt: subAgentPrompt,
          model: deps.model,
          // 子代理工具集 = 父激活集去 task（斩断递归嵌套；含 web_search）。
          tools: deps.getTools().filter((tool) => tool.name !== "task"),
        },
      })

      // 子代理流式文本增量桥接回父 task 工具（renderer 经 tool_execution_update 实时可见进度）。
      const unsubscribe = subAgent.subscribe((event) => {
        if (event.type !== "message_update" || !onUpdate) return
        if (event.message.role !== "assistant") return
        const text = event.message.content
          .filter((block): block is TextContent => block.type === "text")
          .map((block) => block.text)
          .join("")
        if (text) onUpdate({ content: [{ type: "text", text }] })
      })
      // 父 run abort → 子代理级联中止。
      const onAbort = (): void => subAgent.abort()
      signal?.addEventListener("abort", onAbort, { once: true })
      try {
        await subAgent.prompt(params.prompt)
      } finally {
        unsubscribe()
        signal?.removeEventListener("abort", onAbort)
      }

      const { text, error } = extractSubagentResult(subAgent.state.messages)
      const details: SubagentDetails = {
        usage: aggregateUsage(subAgent.state.messages),
        messageCount: subAgent.state.messages.filter((message) => message.role === "assistant")
          .length,
      }
      let content: string
      if (text) {
        const bounded = boundSubagentOutput(text)
        content = bounded.content
        if (bounded.filePath) details.filePath = bounded.filePath
      } else if (error) {
        content = `子代理执行失败：${error}`
      } else {
        content = "（子代理无文本输出）"
      }
      return { content: [{ type: "text", text: content }], details }
    },
  }
}
