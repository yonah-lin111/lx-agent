// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    openFileAt: vi.fn(() => Promise.resolve({ ok: true })),
    revertFileChange: vi.fn(() => Promise.resolve({ ok: true, revertedAt: 123, file: "src/a.ts" })),
  },
}))

import { agentApi } from "@/features/agent/api/agentApi"
import { FileChangesCard } from "@/features/agent/components/blocks"
import { agentFileRevertStore } from "@/features/agent/hooks/agentFileRevertStore"
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
    agentFileRevertStore.clearSession("session-1")
  })

  it("折叠态显示文件数与增删行总数，不渲染文件列表；卡片与汇总行占满 100% 宽度", () => {
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

    const card = screen.getByTestId("file-changes-card")
    const header = document.querySelector(".agent-file-changes-header")
    expect(card.className.split(" ")).toContain("w-full")
    expect(header?.className.split(" ")).toContain("w-full")
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

    const items = document.querySelectorAll<HTMLElement>(".agent-file-changes-item")
    expect(items.length).toBe(2)
    expect(items[0].querySelector(".agent-file-changes-item-added")?.textContent).toBe("+10")
    expect(items[0].querySelector(".agent-file-changes-item-removed")?.textContent).toBe("−2")

    // 文件行为叶子级导航行：行点击不打开文件，仅行尾图标按钮打开并定位首个变更行。
    expect(items[0].getAttribute("data-item-level")).toBe("3")
    fireEvent.click(items[0])
    expect(agentApi.openFileAt).not.toHaveBeenCalled()

    const openButtons = screen.getAllByRole("button", { name: "Open File" })
    expect(openButtons.length).toBe(2)
    fireEvent.click(openButtons[0])
    expect(agentApi.openFileAt).toHaveBeenCalledWith("src/a.ts", 42)

    fireEvent.click(openButtons[1])
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

  it("未提供回退上下文时不渲染回退按钮", () => {
    render(
      <FileChangesCard summary={makeSummary([{ filePath: "src/a.ts", added: 1, removed: 0 }])} />,
    )

    fireEvent.click(screen.getByText("1 file changed"))
    expect(document.querySelector(".agent-file-changes-revert")).toBeNull()
  })

  it("提供回退上下文时二次确认后调用回退接口", async () => {
    render(
      <FileChangesCard
        summary={makeSummary([{ filePath: "src/a.ts", added: 10, removed: 2 }])}
        revertTarget={{ sessionId: "session-1", userMessageTimestamp: 1000 }}
      />,
    )

    fireEvent.click(screen.getByText("1 file changed"))
    const revertButton = document.querySelector<HTMLButtonElement>(".agent-file-changes-revert")
    expect(revertButton).not.toBeNull()

    fireEvent.click(revertButton!)
    // 二次确认气泡：点击确认后才执行回退。
    const confirmButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Confirm"], button[aria-label="确认"]',
    )
    expect(confirmButton).not.toBeNull()
    expect(agentApi.revertFileChange).not.toHaveBeenCalled()
    fireEvent.click(confirmButton!)

    await waitFor(() =>
      expect(agentApi.revertFileChange).toHaveBeenCalledWith("session-1", 1000, "src/a.ts"),
    )
    // 回退成功后写入标记：条目置灰 + "已回退"标签 + 折叠态计数。
    await waitFor(() => {
      expect(agentFileRevertStore.getMarks("session-1")).toEqual([
        { userMessageTimestamp: 1000, file: "src/a.ts", revertedAt: 123 },
      ])
    })
    expect(document.querySelector(".agent-file-changes-reverted-tag")?.textContent).toBe("Reverted")
    expect(document.querySelector(".agent-file-changes-reverted-count")?.textContent).toBe(
      "· 1 reverted",
    )
    expect(document.querySelector(".agent-file-changes-path")?.className).toContain("line-through")
  })

  it("已有回退标记的条目显示置灰、标签与折叠态计数", () => {
    agentFileRevertStore.setSessionMarks("session-1", [
      { userMessageTimestamp: 1000, file: "src/a.ts", revertedAt: 456 },
    ])
    render(
      <FileChangesCard
        summary={makeSummary([
          { filePath: "src/a.ts", added: 10, removed: 2 },
          { filePath: "src/b.ts", added: 5, removed: 1 },
        ])}
        revertTarget={{ sessionId: "session-1", userMessageTimestamp: 1000 }}
      />,
    )

    expect(document.querySelector(".agent-file-changes-reverted-count")?.textContent).toBe(
      "· 1 reverted",
    )
    fireEvent.click(screen.getByText("2 files changed"))

    const items = document.querySelectorAll<HTMLElement>(".agent-file-changes-item")
    expect(items[0].querySelector(".agent-file-changes-reverted-tag")).not.toBeNull()
    expect(items[0].querySelector(".agent-file-changes-path")?.className).toContain("line-through")
    expect(items[1].querySelector(".agent-file-changes-reverted-tag")).toBeNull()
    // 已回退条目的全部按钮禁用（打开/回退），未回退条目保持可用。
    expect(items[0].querySelector<HTMLButtonElement>(".agent-file-changes-open")?.disabled).toBe(
      true,
    )
    expect(items[0].querySelector<HTMLButtonElement>(".agent-file-changes-revert")?.disabled).toBe(
      true,
    )
    expect(items[1].querySelector<HTMLButtonElement>(".agent-file-changes-open")?.disabled).toBe(
      false,
    )
    expect(items[1].querySelector<HTMLButtonElement>(".agent-file-changes-revert")?.disabled).toBe(
      false,
    )

    // 已回退条目点击打开不触发接口；未回退条目正常打开。
    fireEvent.click(items[0].querySelector<HTMLButtonElement>(".agent-file-changes-open")!)
    expect(agentApi.openFileAt).not.toHaveBeenCalled()
    fireEvent.click(items[1].querySelector<HTMLButtonElement>(".agent-file-changes-open")!)
    expect(agentApi.openFileAt).toHaveBeenCalledWith("src/b.ts", 1)
  })

  it("回退按钮悬停展示 tooltip（both 触发器），已回退条目展示回退时间", async () => {
    agentFileRevertStore.setSessionMarks("session-1", [
      { userMessageTimestamp: 1000, file: "src/a.ts", revertedAt: 456 },
    ])
    render(
      <FileChangesCard
        summary={makeSummary([
          { filePath: "src/a.ts", added: 10, removed: 2 },
          { filePath: "src/b.ts", added: 5, removed: 1 },
        ])}
        revertTarget={{ sessionId: "session-1", userMessageTimestamp: 1000 }}
      />,
    )

    fireEvent.click(screen.getByText("2 files changed"))
    const triggers = document.querySelectorAll<HTMLElement>(".agent-file-changes-revert-trigger")
    expect(triggers.length).toBe(2)

    // 已回退条目：按钮禁用，悬停触发器仍展示回退时间。
    expect(
      triggers[0]!.querySelector<HTMLButtonElement>(".agent-file-changes-revert")?.disabled,
    ).toBe(true)
    fireEvent.mouseEnter(triggers[0]!)
    expect(await screen.findByText(/Reverted at /)).not.toBeNull()
    fireEvent.mouseLeave(triggers[0]!)

    // 未回退条目：悬停展示回退动作说明。
    fireEvent.mouseEnter(triggers[1]!)
    expect(await screen.findByText("Revert File")).not.toBeNull()
  })

  it("回退失败（ok:false）不抛错且状态复位", async () => {
    vi.mocked(agentApi.revertFileChange).mockResolvedValueOnce({ ok: false })
    render(
      <FileChangesCard
        summary={makeSummary([{ filePath: "src/a.ts", added: 10, removed: 2 }])}
        revertTarget={{ sessionId: "session-1", userMessageTimestamp: 1000 }}
      />,
    )

    fireEvent.click(screen.getByText("1 file changed"))
    fireEvent.click(document.querySelector<HTMLButtonElement>(".agent-file-changes-revert")!)
    fireEvent.click(
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Confirm"], button[aria-label="确认"]',
      )!,
    )

    await waitFor(() =>
      expect(agentApi.revertFileChange).toHaveBeenCalledWith("session-1", 1000, "src/a.ts"),
    )
    // 失败后按钮恢复可用（无 pending 残留）。
    await waitFor(() =>
      expect(
        document.querySelector<HTMLButtonElement>(".agent-file-changes-revert")?.disabled,
      ).toBe(false),
    )
  })
})
