import { Brain, Layers, Sliders, Wrench } from "lucide-react"
import type React from "react"
import {
  BUILTIN_UNDERSCORE_TOOLS,
  SKILL_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from "@/features/agent/components/AgentMessageList/AgentMessageItem/constants"
import { getMcpServerName } from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import type { ExecutionSystemContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemSystemContentProps {
  content: ExecutionSystemContent
}

/** MCP 策略指引分段的段名（main 侧 PROMPT_SECTION_NAMES.MCP_GUIDANCE）。 */
export const MCP_GUIDANCE_SECTION_NAME = "agent:mcp-guidance"

interface McpGuidanceServer {
  serverName: string
  text: string
}

interface McpGuidanceParsed {
  priority: string
  workspaceHygiene: string
  servers: McpGuidanceServer[]
}

// 解析指引 XML：拆出 priority / workspace_hygiene 与各 server 子块；解析不到 server 时由调用方回退整段原文。
const parseMcpGuidance = (text: string): McpGuidanceParsed => {
  const priority = /<priority>([\s\S]*?)<\/priority>/.exec(text)?.[1].trim() ?? ""
  const workspaceHygiene =
    /<workspace_hygiene>([\s\S]*?)<\/workspace_hygiene>/.exec(text)?.[1].trim() ?? ""
  const servers: McpGuidanceServer[] = []
  for (const match of text.matchAll(/<server name="([^"]+)">([\s\S]*?)<\/server>/g)) {
    servers.push({ serverName: match[1], text: match[2].trim() })
  }
  return { priority, workspaceHygiene, servers }
}

export type ToolSourceCategoryKey = "tool" | "mcp" | "skill" | "webSearch"

export interface ToolSourceCategoryConfig {
  key: ToolSourceCategoryKey
  label: string
  dotColor: string
}

export const TOOL_SOURCE_CATEGORIES: Record<ToolSourceCategoryKey, ToolSourceCategoryConfig> = {
  tool: {
    key: "tool",
    label: "Tool",
    dotColor: "bg-amber-400",
  },
  mcp: {
    key: "mcp",
    label: "MCP",
    dotColor: "bg-teal-400",
  },
  skill: {
    key: "skill",
    label: "Skill",
    dotColor: "bg-purple-400",
  },
  webSearch: {
    key: "webSearch",
    label: "Web Search",
    dotColor: "bg-sky-400",
  },
}

export const TOOL_SOURCE_ORDER: ToolSourceCategoryKey[] = ["tool", "mcp", "skill", "webSearch"]

const getToolSourceCategory = (toolName: string): ToolSourceCategoryKey => {
  if (toolName === SKILL_TOOL_NAME || toolName === "read_skill") {
    return "skill"
  }
  if (toolName === WEB_SEARCH_TOOL_NAME || toolName === "webfetch") {
    return "webSearch"
  }
  if (!BUILTIN_UNDERSCORE_TOOLS.has(toolName) && toolName.includes("_")) {
    return "mcp"
  }
  return "tool"
}

const groupToolsByCategory = (
  tools: string[],
): { category: ToolSourceCategoryKey; tools: string[] }[] => {
  const map = new Map<ToolSourceCategoryKey, string[]>()
  for (const tool of tools) {
    const cat = getToolSourceCategory(tool)
    const list = map.get(cat)
    if (list) {
      list.push(tool)
    } else {
      map.set(cat, [tool])
    }
  }
  return TOOL_SOURCE_ORDER.filter((cat) => (map.get(cat)?.length ?? 0) > 0).map((cat) => ({
    category: cat,
    tools: map.get(cat)!,
  }))
}

// 将 MCP 工具按服务前缀（Server Name）二级分组
const groupMcpToolsByServer = (mcpTools: string[]): { serverName: string; tools: string[] }[] => {
  const map = new Map<string, string[]>()
  for (const tool of mcpTools) {
    const serverName = getMcpServerName(tool)
    const list = map.get(serverName)
    if (list) {
      list.push(tool)
    } else {
      map.set(serverName, [tool])
    }
  }
  return Array.from(map.entries()).map(([serverName, tools]) => ({
    serverName,
    tools,
  }))
}

export const FlowItemSystemContent = ({
  content,
}: FlowItemSystemContentProps): React.JSX.Element => {
  const { t } = useTranslation()
  // 系统项中不展示当前模型的自适应提示词段，统一在 Initial Model / Model Switched 项中展示
  const visibleSections = content.sections.filter(
    (sec) => !sec.name.toLowerCase().includes("model-adaptive"),
  )
  // MCP 策略指引独立成折叠块，不再混入通用系统提示词分段列表
  const mcpGuidanceSection = visibleSections.find((sec) => sec.name === MCP_GUIDANCE_SECTION_NAME)
  const regularSections = visibleSections.filter((sec) => sec.name !== MCP_GUIDANCE_SECTION_NAME)
  const mcpGuidance = mcpGuidanceSection
    ? parseMcpGuidance(mcpGuidanceSection.text)
    : { priority: "", workspaceHygiene: "", servers: [] }

  return (
    <div className="agent-execution-flow-system-content flex flex-col gap-3 font-mono text-xs">
      {/* MCP 策略指引（独立折叠块：展开后按 server 逐项折叠） */}
      {mcpGuidanceSection && (
        <div className="agent-execution-flow-mcp-guidance flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-teal-300 font-semibold">
            <Brain className="h-3 w-3" />
            <span>{t("agent.mcpGuidance")}</span>
          </div>
          <details className="group rounded border border-white/5 bg-white/[0.02] p-2">
            <summary className="cursor-pointer font-semibold text-teal-300/90 select-none">
              {MCP_GUIDANCE_SECTION_NAME}
            </summary>
            {mcpGuidance.servers.length > 0 ? (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {mcpGuidance.priority && (
                  <div className="rounded bg-teal-500/[0.04] p-2 leading-relaxed text-teal-100/70">
                    {mcpGuidance.priority}
                  </div>
                )}
                {mcpGuidance.workspaceHygiene && (
                  <div className="rounded bg-teal-500/[0.04] p-2 leading-relaxed text-teal-100/70">
                    {mcpGuidance.workspaceHygiene}
                  </div>
                )}
                {mcpGuidance.servers.map(({ serverName, text }) => (
                  <details
                    key={serverName}
                    className="rounded border border-white/5 bg-black/20 p-2"
                  >
                    <summary className="cursor-pointer font-mono text-xs font-semibold text-teal-200/80 select-none">
                      {serverName}
                    </summary>
                    <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-xs leading-relaxed text-white/70">
                      {text}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-xs leading-relaxed text-white/70">
                {mcpGuidanceSection.text}
              </div>
            )}
          </details>
        </div>
      )}

      {/* 分段概览 */}
      {regularSections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-indigo-300 font-semibold">
            <Layers className="h-3 w-3" />
            <span>{t("agent.systemPrompt")}</span>
          </div>
          <div className="flex flex-col gap-1">
            {regularSections.map((sec) => (
              <details
                key={sec.name}
                className="group rounded border border-white/5 bg-white/[0.02] p-2"
              >
                <summary className="cursor-pointer font-semibold text-white/80 select-none">
                  {sec.name}
                </summary>
                <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-xs leading-relaxed text-white/70">
                  {sec.text}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* 运行时上下文注入（与上面的 System Prompt 一致，使用 details/summary 支持折叠展开） */}
      {content.contexts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-sky-300 font-semibold">
            <Sliders className="h-3 w-3" />
            <span>{t("agent.runtimeContext")}</span>
          </div>
          <div className="flex flex-col gap-1">
            {content.contexts.map((ctx) => (
              <details
                key={ctx.name}
                className="group rounded border border-white/5 bg-white/[0.02] p-2"
              >
                <summary className="cursor-pointer font-semibold text-white/80 select-none">
                  {ctx.name}
                </summary>
                <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-xs leading-relaxed text-white/70">
                  {ctx.text}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* 激活的工具全集（按分类展示，MCP 内部按服务名进一步分组） */}
      {content.activeTools && content.activeTools.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 text-amber-300 font-semibold">
            <Wrench className="h-3 w-3" />
            <span>{t("agent.activeToolsList")}</span>
          </div>
          <div className="flex flex-col gap-1.5 pl-1">
            {groupToolsByCategory(content.activeTools).map(({ category, tools }) => {
              const catConfig = TOOL_SOURCE_CATEGORIES[category]

              if (category === "mcp") {
                const serverGroups = groupMcpToolsByServer(tools)
                return (
                  <div key={category} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <span className={`h-1.5 w-1.5 rounded-full ${catConfig.dotColor}`} />
                      <span className="font-mono">{catConfig.label}</span>
                      <span className="text-white/30">({tools.length})</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pl-3">
                      {serverGroups.map(({ serverName, tools: serverTools }) => (
                        <div key={serverName} className="flex flex-col gap-1">
                          <div className="text-xs text-teal-300/70 font-mono">
                            {serverName} ({serverTools.length})
                          </div>
                          <div className="flex flex-wrap gap-1 pl-2">
                            {serverTools.map((tool) => (
                              <span
                                key={tool}
                                className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-white/70 font-mono"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }

              return (
                <div key={category} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs text-white/50">
                    <span className={`h-1.5 w-1.5 rounded-full ${catConfig.dotColor}`} />
                    <span className="font-mono">{catConfig.label}</span>
                    <span className="text-white/30">({tools.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-3">
                    {tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-white/70 font-mono"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
