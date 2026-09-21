// @vitest-environment jsdom

import type { SubagentData } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FlowItemSubagentContent } from "@/features/agent/components/AgentExecutionFlowList/FlowItemSubagentContent"

// 批量子代理快照。
const buildItem = (
  id: string,
  name: string,
  options?: {
    roleName?: string
    status?: SubagentData["status"]
    totalTokens?: number
    steps?: SubagentData["steps"]
    usage?: Partial<SubagentData["usage"]>
  },
): SubagentData => ({
  subagentId: id,
  name,
  ...(options?.roleName ? { roleName: options.roleName } : {}),
  ...(options?.status ? { status: options.status } : {}),
  description: `${name} 任务`,
  prompt: `${name} 任务`,
  messages: [],
  steps: options?.steps ?? [],
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: options?.totalTokens ?? 2,
    ...options?.usage,
  },
})

describe("FlowItemSubagentContent 批量扇出", () => {
  afterEach(cleanup)

  it("逐项渲染子代理入口，点击携带对应下标", () => {
    const onOpenSubagentItem = vi.fn()
    const { container } = render(
      <FlowItemSubagentContent
        content={{
          name: "task ×2",
          subagents: [
            buildItem("subagent-1", "review-auth", {
              roleName: "explorer",
              status: "done",
              totalTokens: 1200,
              steps: [{ toolName: "grep", args: {}, status: "done" }],
              usage: { input: 900, output: 300, cacheRead: 1200 },
            }),
            buildItem("subagent-2", "review-db", {
              status: "running",
              totalTokens: 800,
              steps: [{ toolName: "read", args: { filePath: "/tmp/a/db.ts" }, status: "running" }],
            }),
          ],
        }}
        onOpenSubagentItem={onOpenSubagentItem}
      />,
    )

    const buttons = screen.getAllByLabelText("View subagent execution details")
    expect(buttons).toHaveLength(2)
    // 名称不带 " - " 前缀，角色以括号紧随名称。
    expect(buttons[0]?.textContent?.trim().startsWith("review-auth (explorer)")).toBe(true)
    expect(buttons[0]?.textContent).not.toContain(" - ")
    expect(buttons[1]?.textContent?.trim().startsWith("review-db")).toBe(true)

    // 第一行只保留状态图标，不再展示 token 数字。
    expect(buttons[0]?.textContent).not.toContain("1.2k")
    expect(buttons[0]?.querySelector(".animate-spin")).toBeNull()
    expect(buttons[1]?.querySelector(".animate-spin")).not.toBeNull()

    // 第三行：Token 明细（IN / OUT / CACHE）位于单项底部，仅终态展示。
    const items = container.querySelectorAll(".agent-execution-flow-subagent-item")
    expect(items).toHaveLength(2)
    const doneUsage = items[0]?.querySelector(".agent-execution-flow-subagent-usage")
    expect(doneUsage?.textContent).toContain("IN 900")
    expect(doneUsage?.textContent).toContain("OUT 300")
    expect(doneUsage?.textContent).toContain("CACHE 1.2k")
    expect(items[0]?.contains(doneUsage as Node)).toBe(true)
    expect(items[1]?.querySelector(".agent-execution-flow-subagent-usage")).toBeNull()

    // 第二行：直角图标 + 当前内部工具（运行项）/ 调用统计（完成项）。
    const rows = container.querySelectorAll("[data-subagent-row]")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute("data-subagent-row")).toBe("stats")
    expect(rows[0]?.querySelector(".lucide-corner-down-right")).not.toBeNull()
    expect(rows[1]?.getAttribute("data-subagent-row")).toBe("tool")
    expect(rows[1]?.textContent).toContain("read")

    // 汇总行：完成数与并行 token 合计（1200 + 800）。
    expect(container.textContent).toContain("1/2 completed")
    expect(container.textContent).toContain("Σ 2.0k tok")

    fireEvent.click(buttons[1] as HTMLElement)
    expect(onOpenSubagentItem).toHaveBeenCalledWith(1)
  })

  it("单项子代理不渲染批量入口（保持原有 Prompt/用量展示）", () => {
    render(
      <FlowItemSubagentContent
        content={{ name: "review-auth", subagent: buildItem("subagent-1", "review-auth") }}
      />,
    )

    expect(screen.queryAllByLabelText("View subagent execution details")).toHaveLength(0)
    // Prompt 与描述同文案：用 getAllByText 断言内容存在且仅来自单项分支。
    expect(screen.getAllByText("review-auth 任务").length).toBeGreaterThan(0)
  })
})
