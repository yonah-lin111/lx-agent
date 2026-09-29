// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  GameKeymapPanel,
  type GameKeymapPanelProps,
} from "@/features/game/components/GameKeymapPanel"

afterEach(cleanup)

const renderPanel = (
  override: Partial<GameKeymapPanelProps> = {},
): { onSave: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } => {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <GameKeymapPanel
      isOpen
      keymap={null}
      isSaving={false}
      onClose={onClose}
      onSave={onSave}
      {...override}
    />,
  )
  return { onSave, onClose }
}

const rowValue = (actionLabel: string): HTMLElement => {
  const button = screen.getByRole("button", { name: actionLabel })
  return within(button).getByText(/^(W|J|Q|Esc|Tab|P|X|Press a key…)$/)
}

describe("GameKeymapPanel", () => {
  it("按手柄按键与模拟器热键分组展示默认键位", () => {
    renderPanel()

    expect(screen.getByText("Gamepad buttons")).toBeDefined()
    expect(screen.getByText("Emulator hotkeys")).toBeDefined()
    expect(within(screen.getByRole("button", { name: "Up" })).getByText("W")).toBeDefined()
    expect(within(screen.getByRole("button", { name: "A button" })).getByText("J")).toBeDefined()
    expect(within(screen.getByRole("button", { name: "L button" })).getByText("Q")).toBeDefined()
    expect(
      within(screen.getByRole("button", { name: "Pause / Resume" })).getByText("Esc"),
    ).toBeDefined()
    expect(
      within(screen.getByRole("button", { name: "Fast-forward" })).getByText("Tab"),
    ).toBeDefined()
  })

  it("已存覆盖在打开时生效", () => {
    renderPanel({ keymap: { a: "KeyX" } })

    expect(within(screen.getByRole("button", { name: "A button" })).getByText("X")).toBeDefined()
  })

  it("点击行后按新键完成绑定，保存只落差异覆盖", () => {
    const { onSave } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Up" }))
    expect(rowValue("Up").textContent).toBe("Press a key…")

    fireEvent.keyDown(window, { code: "KeyP", keyCode: 80 })
    expect(rowValue("Up").textContent).toBe("P")

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith({ up: "KeyP" })
  })

  it("组合键被拒绝，草稿保持原键位且保持捕获态", () => {
    const { onSave } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Up" }))
    fireEvent.keyDown(window, { code: "KeyP", keyCode: 80, ctrlKey: true })

    expect(screen.getByText("Key combinations are not supported")).toBeDefined()
    // 捕获态保留，草稿未被污染：随后按下的合法单键正常绑定。
    expect(rowValue("Up").textContent).toBe("Press a key…")
    fireEvent.keyDown(window, { code: "KeyP", keyCode: 80 })
    expect(rowValue("Up").textContent).toBe("P")

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith({ up: "KeyP" })
  })

  it("同一游戏内按键冲突时提示并禁止保存", () => {
    renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Up" }))
    fireEvent.keyDown(window, { code: "KeyJ", keyCode: 74 })

    expect(screen.getByText("J is already used by A button")).toBeDefined()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("恢复默认清空草稿差异，保存回落默认覆盖", () => {
    const { onSave } = renderPanel({ keymap: { a: "KeyX" } })

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }))
    expect(within(screen.getByRole("button", { name: "A button" })).getByText("J")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith(null)
  })

  it("捕获态下 ESC 作为绑定目标，不触发关闭", () => {
    const { onClose } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Pause / Resume" }))
    fireEvent.keyDown(window, { code: "KeyP", keyCode: 80 })

    fireEvent.click(screen.getByRole("button", { name: "Pause / Resume" }))
    fireEvent.keyDown(window, { code: "Escape", keyCode: 27 })

    expect(onClose).not.toHaveBeenCalled()
    expect(rowValue("Pause / Resume").textContent).toBe("Esc")
  })

  it("取消关闭面板，不触发保存", () => {
    const { onSave, onClose } = renderPanel()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
