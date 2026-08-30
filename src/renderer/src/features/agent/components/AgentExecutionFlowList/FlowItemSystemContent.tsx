import { Layers, Sliders, Wrench } from "lucide-react"
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
    dotColor: "bg-cyan-400",
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
const groupMcpToolsByServer = (
  mcpTools: string[],
): { serverName: string; tools: string[] }[] => {
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

  return (
    <div className="agent-execution-flow-system-content flex flex-col gap-3 font-mono text-[11px]">
      {/* 分段概览 */}
      {visibleSections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-indigo-300 font-semibold">
            <Layers className="h-3 w-3" />
            <span>{t("agent.systemPrompt")}</span>
          </div>
          <div className="flex flex-col gap-1">
            {visibleSections.map((sec) => (
              <details
                key={sec.name}
                className="group rounded border border-white/5 bg-white/[0.02] p-2"
              >
                <summary className="cursor-pointer font-semibold text-white/80 select-none">
                  {sec.name}
                </summary>
                <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-white/70">
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
                <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-white/70">
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
                    <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                      <span className={`h-1.5 w-1.5 rounded-full ${catConfig.dotColor}`} />
                      <span className="font-mono">{catConfig.label}</span>
                      <span className="text-white/30">({tools.length})</span>
                    </div>
                    <div className="flex flex-col gap-1.5 pl-3">
                      {serverGroups.map(({ serverName, tools: serverTools }) => (
                        <div key={serverName} className="flex flex-col gap-1">
                          <div className="text-[10px] text-cyan-300/70 font-mono">
                            {serverName} ({serverTools.length})
                          </div>
                          <div className="flex flex-wrap gap-1 pl-2">
                            {serverTools.map((tool) => (
                              <span
                                key={tool}
                                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 font-mono"
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
                  <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                    <span className={`h-1.5 w-1.5 rounded-full ${catConfig.dotColor}`} />
                    <span className="font-mono">{catConfig.label}</span>
                    <span className="text-white/30">({tools.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pl-3">
                    {tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 font-mono"
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

