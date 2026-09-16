// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import type { ExecutionStep } from "@/features/agent/types"

const makeStep = (patch: Partial<ExecutionStep>): ExecutionStep => ({
  id: "step-1",
  messageId: "msg-1",
  turnIndex: 1,
  stepIndex: 1,
  kind: "assistant",
  title: "已完成。",
  status: "done",
  timestamp: 1000,
  ...patch,
})

describe("AgentExecutionFlowItem - Token Saver 底部标注", () => {
  afterEach(() => {
    cleanup()
  })

  it("RTK 命中与风格提示词生效时展示底部标注", () => {
    render(
      <AgentExecutionFlowItem
        step={makeStep({
          tokens: { input: 4200, output: 180, total: 4380 },
          tokenSaver: {
            rtkFilters: ["git-diff", "grep"],
            rtkSavedChars: 86412,
            cavemanLevel: "ultra",
          },
        })}
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    )

    const badge = screen.getByTestId("flow-item-token-saver")
    expect(badge.textContent).toBe("RTK −86k · Caveman ultra")
  })

  it("Ponytail 档位展示在标注中", () => {
    render(
      <AgentExecutionFlowItem
        step={makeStep({
          tokens: { input: 10, output: 5, total: 15 },
          tokenSaver: { ponytailLevel: "full" },
        })}
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    )

    expect(screen.getByTestId("flow-item-token-saver").textContent).toBe("Ponytail full")
  })

  it("无 Token Saver 记录时不渲染标注", () => {
    render(
      <AgentExecutionFlowItem
        step={makeStep({ tokens: { input: 10, output: 5, total: 15 } })}
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    )

    expect(screen.queryByTestId("flow-item-token-saver")).toBeNull()
  })

  it("运行中的步骤不提前展示标注", () => {
    render(
      <AgentExecutionFlowItem
        step={makeStep({
          status: "running",
          parallel: { index: 1, total: 2, batchId: "batch-1", batchIndex: 0 },
          tokenSaver: { rtkFilters: ["git-log"], rtkSavedChars: 2048 },
        })}
        isExpanded={false}
        onToggleExpand={vi.fn()}
      />,
    )

    expect(screen.queryByTestId("flow-item-token-saver")).toBeNull()
  })
})
