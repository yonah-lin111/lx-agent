import { Layers, Sliders, Wrench } from "lucide-react"
import type React from "react"
import {
  BUILTIN_UNDERSCORE_TOOLS,
  SKILL_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from "@/features/agent/components/AgentMessageList/AgentMessageItem/constants"
import type { ExecutionSystemContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemSystemContentProps {
  content: ExecutionSystemContent
}

export type ToolSourceCategoryKey = "mcp" | "tool" | "skill" | "webSearch"

export interface ToolSourceCategoryConfig {
  key: ToolSourceCategoryKey
  label: string
  dotColor: string
}

export const TOOL_SOURCE_CATEGORIES: Record<ToolSourceCategoryKey, ToolSourceCategoryConfig> = {
  tool: {
    key: "tool",
    label: "Tool",
    dotColor: "bg-emerald-400",
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
    dotColor: "bg-blue-400",
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

      {/* 运行时上下文注入 */}
      {content.contexts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-sky-300 font-semibold">
            <Sliders className="h-3 w-3" />
            <span>{t("agent.runtimeContext")}</span>
          </div>
          <div className="flex flex-col gap-1">
            {content.contexts.map((ctx) => (
              <div
                key={ctx.name}
                className="rounded border border-white/5 bg-black/30 p-2 text-white/70"
              >
                <div className="font-semibold text-white/80">{ctx.name}</div>
                <div className="mt-1 whitespace-pre-wrap">{ctx.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 激活的工具全集（按分类展示） */}
      {content.activeTools && content.activeTools.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 text-amber-300 font-semibold">
            <Wrench className="h-3 w-3" />
            <span>{t("agent.activeToolsList")}</span>
          </div>
          <div className="flex flex-col gap-1.5 pl-1">
            {groupToolsByCategory(content.activeTools).map(({ category, tools }) => {
              const catConfig = TOOL_SOURCE_CATEGORIES[category]
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

