// @vitest-environment jsdom

import type { SubagentData } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FlowItemSubagentContent } from "@/features/agent/components/AgentExecutionFlowList/FlowItemSubagentContent"

// 批量子代理快照。
const buildItem = (
  id: string,
  name: string,
  options?: { roleName?: string; status?: SubagentData["status"]; totalTokens?: number },
): SubagentData => ({
  subagentId: id,
  name,
  ...(options?.roleName ? { roleName: options.roleName } : {}),
  ...(options?.status ? { status: options.status } : {}),
  description: `${name} 任务`,
  prompt: `${name} 任务`,
  messages: [],
  steps: [],
  usage: {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: options?.totalTokens ?? 2,
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
            }),
            buildItem("subagent-2", "review-db", { status: "running", totalTokens: 800 }),
          ],
        }}
        onOpenSubagentItem={onOpenSubagentItem}
      />,
    )

    const buttons = screen.getAllByLabelText("View subagent execution details")
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.textContent).toContain("review-auth")
    expect(buttons[1]?.textContent).toContain("review-db")

    // 单项 token 与状态图标：完成项 ✓、运行项 spinner。
    expect(buttons[0]?.textContent).toContain("1.2k")
    expect(buttons[1]?.textContent).toContain("800")
    expect(buttons[0]?.querySelector(".animate-spin")).toBeNull()
    expect(buttons[1]?.querySelector(".animate-spin")).not.toBeNull()

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
