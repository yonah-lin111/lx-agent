import type { AgentTool, AgentToolCall } from "./types"

// 校验工具调用参数：按工具 schema safeParse，失败抛带格式化信息的错误。
export const validateToolArguments = (tool: AgentTool<any>, toolCall: AgentToolCall): unknown => {
  const args = structuredClone(toolCall.arguments)
  const parsed = tool.inputSchema.safeParse(args)
  if (parsed.success) {
    return parsed.data
  }

  const errors = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n")
  const errorMessage = `Validation failed for tool "${toolCall.name}":\n${errors}\n\nReceived arguments:\n${JSON.stringify(toolCall.arguments, null, 2)}`
  throw new Error(errorMessage)
}

// 按名称从工具集查找工具。
export const findTool = (
  tools: AgentTool<any>[] | undefined,
  name: string,
): AgentTool<any> | undefined => tools?.find((tool) => tool.name === name)
