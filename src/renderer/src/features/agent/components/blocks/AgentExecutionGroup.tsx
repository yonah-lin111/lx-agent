import { ChevronDown, CornerDownRight } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"

// 执行类别联合类型。
export type ExecutionCategoryKey =
  | "searchCodebase"
  | "externalInfo"
  | "system"
  | "subagent"
  | "coding"

// 类别配置项。
export interface CategoryConfig {
  key: ExecutionCategoryKey
  label: string
  dotColor: string
}

// 5 大类别定义与配色。
export const EXECUTION_CATEGORIES: Record<ExecutionCategoryKey, CategoryConfig> = {
  searchCodebase: {
    key: "searchCodebase",
    label: "Search CodeBase",
    dotColor: "bg-amber-300",
  },
  externalInfo: {
    key: "externalInfo",
    label: "External Info",
    dotColor: "bg-cyan-300",
  },
  system: {
    key: "system",
    label: "System",
    dotColor: "bg-rose-300",
  },
  subagent: {
    key: "subagent",
    label: "Subagent",
    dotColor: "bg-blue-300",
  },
  coding: {
    key: "coding",
    label: "Coding",
    dotColor: "bg-emerald-300",
  },
}

// 类别固定展示顺序（subagent 在 coding 上方）。
export const CATEGORY_ORDER: ExecutionCategoryKey[] = [
  "searchCodebase",
  "externalInfo",
  "system",
  "subagent",
  "coding",
]

// 根据工具名获取执行类别。
export const getToolExecutionCategory = (toolName: string): ExecutionCategoryKey => {
  if (toolName === "edit" || toolName === "write") {
    return "coding"
  }
  if (toolName === "task") {
    return "subagent"
  }
  if (toolName === "edit" || toolName === "write" || toolName === "apply_patch") {
    return "coding"
  }
  if (
    toolName === "read" ||
    toolName === "ls" ||
    toolName === "grep" ||
    toolName === "find" ||
    toolName === "lsp"
  ) {
    return "searchCodebase"
  }
  if (
    toolName === "web_search" ||
    toolName === "webfetch" ||
    toolName === "read_skill" ||
    (!["apply_patch", "job_output", "job_list", "job_kill"].includes(toolName) &&
      toolName.includes("_"))
  ) {
    return "externalInfo"
  }
  return "system"
}

// 执行组子项类型。
export type ExecutionGroupItem = {
  category: ExecutionCategoryKey
  node: React.ReactNode
}

// 执行折叠组件属性类型。
export interface AgentExecutionGroupProps {
  // 组内渲染内容列表。
  items: ExecutionGroupItem[]
  // 初始是否展开（保留兼容）。
  defaultExpanded?: boolean
}

/**
 * Agent 执行组组件：展示 Execute Group 标题，下方直接展示分类行（Search CodeBase、External Info、System、Coding），分类支持折叠展开。
 */
export const AgentExecutionGroup = ({
  items,
}: AgentExecutionGroupProps): React.JSX.Element | null => {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})

  // 按类别对 items 分组。
  const groupedItems = useMemo(() => {
    const map = new Map<ExecutionCategoryKey, ExecutionGroupItem[]>()
    for (const item of items) {
      const list = map.get(item.category)
      if (list) {
        list.push(item)
      } else {
        map.set(item.category, [item])
      }
    }
    return map
  }, [items])

  // 按固定顺序提取当前包含条目的有效类别。
  const activeCategories = useMemo(
    () => CATEGORY_ORDER.filter((categoryKey) => (groupedItems.get(categoryKey)?.length ?? 0) > 0),
    [groupedItems],
  )

  if (items.length === 0) {
    return null
  }

  const toggleCategory = (categoryKey: ExecutionCategoryKey): void => {
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }))
  }

  return (
    <div className="agent-execution-group my-0.5 flex min-w-0 flex-col gap-1">
      <div className="agent-execution-group-header flex w-fit items-center gap-1.5 text-[12px]">
        <span
          aria-hidden
          className="agent-execution-group-dot h-1.5 w-1.5 shrink-0 rounded-full bg-white/80"
        />
        <span className="font-mono text-[12px] font-semibold text-white/90">Execute Group</span>
        <span className="text-[11px] text-white/40">({items.length})</span>
      </div>

      <div className="agent-execution-categories flex min-w-0 flex-col gap-1">
        {activeCategories.map((categoryKey) => {
          const categoryConfig = EXECUTION_CATEGORIES[categoryKey]
          const categoryItems = groupedItems.get(categoryKey) ?? []
          const isCategoryExpanded = Boolean(expandedCategories[categoryKey])

          return (
            <div
              key={categoryKey}
              className="agent-execution-category relative flex flex-col gap-1"
            >
              <button
                type="button"
                aria-expanded={isCategoryExpanded}
                className="agent-execution-category-toggle ml-1 flex h-5 w-fit items-center gap-1.5 rounded-[4px] px-1 text-[12px] text-white/60 transition-colors hover:text-white/80 focus:outline-none"
                onClick={() => toggleCategory(categoryKey)}
              >
                <CornerDownRight className="h-3 w-3 shrink-0 text-white/40" />
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${categoryConfig.dotColor}`}
                />
                <span className="font-mono font-medium text-white/70">{categoryConfig.label}</span>
                <span className="text-[11px] text-white/35">({categoryItems.length})</span>
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-200 ${isCategoryExpanded ? "" : "-rotate-90"}`}
                />
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: isCategoryExpanded ? "1fr" : "0fr",
                  opacity: isCategoryExpanded ? 1 : 0,
                  transition:
                    "grid-template-rows 0.2s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.2s cubic-bezier(0.2, 0.85, 0.2, 1)",
                }}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="relative ml-5 flex min-w-0 flex-col gap-1.5 border-l border-white/10 pl-3 py-1">
                    {categoryItems.map((item, itemIndex) => (
                      <div key={itemIndex} className="agent-execution-item min-w-0">
                        {item.node}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
