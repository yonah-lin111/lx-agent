import { beforeEach, describe, expect, it, vi } from "vitest"
import { useTerminalStore } from "@/features/terminal/terminalStore"

vi.mock("@/features/terminal/api/terminalApi", () => ({
  terminalApi: {
    kill: vi.fn(),
  },
}))

describe("terminalStore", () => {
  beforeEach(() => {
    useTerminalStore.setState({ tabs: [], activeTabId: null, terminalCounter: 1 })
  })

  it("支持新增标签页并自动递增默认标题与激活新建标签", () => {
    const id1 = useTerminalStore.getState().addTab()
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
    expect(useTerminalStore.getState().tabs[0]?.title).toBe("终端 1")
    expect(useTerminalStore.getState().activeTabId).toBe(id1)

    const id2 = useTerminalStore.getState().addTab({ title: "Custom" })
    expect(useTerminalStore.getState().tabs).toHaveLength(2)
    expect(useTerminalStore.getState().tabs[1]?.title).toBe("Custom")
    expect(useTerminalStore.getState().activeTabId).toBe(id2)
  })

  it("支持重命名标签页", () => {
    const id = useTerminalStore.getState().addTab()
    useTerminalStore.getState().updateTabTitle(id, "My Shell")
    expect(useTerminalStore.getState().tabs[0]?.title).toBe("My Shell")
  })

  it("删除激活标签页时自动激活相邻标签", () => {
    const id1 = useTerminalStore.getState().addTab()
    const id2 = useTerminalStore.getState().addTab()
    const id3 = useTerminalStore.getState().addTab()

    // 当前 active 是 id3
    useTerminalStore.getState().removeTab(id3)
    expect(useTerminalStore.getState().tabs).toHaveLength(2)
    expect(useTerminalStore.getState().activeTabId).toBe(id2)

    // 当前 active 是 id2，删除 id2
    useTerminalStore.getState().removeTab(id2)
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
    expect(useTerminalStore.getState().activeTabId).toBe(id1)

    // 删除最后一个
    useTerminalStore.getState().removeTab(id1)
    expect(useTerminalStore.getState().tabs).toHaveLength(0)
    expect(useTerminalStore.getState().activeTabId).toBeNull()
  })
})
