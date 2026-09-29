// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    openFileAt: vi.fn(() => Promise.resolve({ ok: true })),
  },
}))

import { agentApi } from "@/features/agent/api/agentApi"
import { FileChangesCard } from "@/features/agent/components/blocks"
import type { FileChangeSummary } from "@/features/agent/utils/fileChanges"

// jsdom ResizeObserver stub（Tooltip 定位依赖）。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// 构造文件修改汇总。
const makeSummary = (
  files: { filePath: string; added: number; removed: number; line?: number }[],
): FileChangeSummary => ({
  files: files.map((file) => ({ line: 1, ...file })),
  totalAdded: files.reduce((sum, file) => sum + file.added, 0),
  totalRemoved: files.reduce((sum, file) => sum + file.removed, 0),
})

describe("FileChangesCard", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("折叠态显示文件数与增删行总数，不渲染文件列表", () => {
    render(
      <FileChangesCard
        summary={makeSummary([
          { filePath: "src/a.ts", added: 10, removed: 2 },
          { filePath: "src/b.ts", added: 5, removed: 1 },
        ])}
      />,
    )

    expect(screen.getByText("2 files changed")).not.toBeNull()
    expect(document.querySelector(".agent-file-changes-total-added")?.textContent).toBe("+15")
    expect(document.querySelector(".agent-file-changes-total-removed")?.textContent).toBe("−3")
    expect(document.querySelector(".agent-file-changes-list")).toBeNull()
  })

  it("单文件使用单数文案", () => {
    render(
      <FileChangesCard summary={makeSummary([{ filePath: "src/a.ts", added: 1, removed: 0 }])} />,
    )
    expect(screen.getByText("1 file changed")).not.toBeNull()
  })

  it("展开后逐文件展示增删行，点击文件打开并定位首个变更行", () => {
    render(
      <FileChangesCard
        summary={makeSummary([
          { filePath: "src/a.ts", added: 10, removed: 2, line: 42 },
          { filePath: "src/b.ts", added: 5, removed: 1, line: 7 },
        ])}
      />,
    )

    fireEvent.click(screen.getByText("2 files changed"))

    expect(screen.getByText("src/a.ts")).not.toBeNull()
    expect(screen.getByText("src/b.ts")).not.toBeNull()

    const fileButtons = document.querySelectorAll<HTMLButtonElement>(".agent-file-changes-item")
    expect(fileButtons.length).toBe(2)
    expect(fileButtons[0].querySelector(".agent-file-changes-item-added")?.textContent).toBe("+10")
    expect(fileButtons[0].querySelector(".agent-file-changes-item-removed")?.textContent).toBe("−2")

    fireEvent.click(fileButtons[0])
    expect(agentApi.openFileAt).toHaveBeenCalledWith("src/a.ts", 42)

    fireEvent.click(fileButtons[1])
    expect(agentApi.openFileAt).toHaveBeenCalledWith("src/b.ts", 7)
  })

  it("再次点击汇总行折叠文件列表", () => {
    render(
      <FileChangesCard summary={makeSummary([{ filePath: "src/a.ts", added: 1, removed: 0 }])} />,
    )

    fireEvent.click(screen.getByText("1 file changed"))
    expect(document.querySelector(".agent-file-changes-list")).not.toBeNull()

    fireEvent.click(screen.getByText("1 file changed"))
    expect(document.querySelector(".agent-file-changes-list")).toBeNull()
  })
})
