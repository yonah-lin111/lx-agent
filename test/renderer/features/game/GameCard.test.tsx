// @vitest-environment jsdom
import type { GameRomEntry } from "@shared/contracts/game"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GameCard } from "@/features/game/components/GameCard"

const createEntry = (patch: Partial<GameRomEntry> = {}): GameRomEntry => ({
  id: 1,
  title: "Demo Game",
  romHash: "a".repeat(64),
  romSize: 512 * 1024,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  lastPlayedAt: null,
  ...patch,
})

afterEach(cleanup)

describe("GameCard", () => {
  it("展示标题 / 体积 / 最近游玩状态", () => {
    render(
      <GameCard
        entry={createEntry({
          title: "口袋测试",
          romSize: 512 * 1024,
          lastPlayedAt: "2026-09-16T08:00:00.000Z",
        })}
        onPlay={vi.fn()}
        onRename={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText("口袋测试")).toBeDefined()
    // 体积与游玩时间分行独立展示，避免窄卡内被省略号截断
    expect(screen.getByText("512.0 KB")).toBeDefined()
    expect(screen.getByText(/Last played Sep 16, 2026/)).toBeDefined()
    expect(screen.getByText("Imported")).toBeDefined()
  })

  it("使用 GBA 掌机图标标识 ROM 卡片", () => {
    const { container } = render(
      <GameCard entry={createEntry()} onPlay={vi.fn()} onRename={vi.fn()} onRemove={vi.fn()} />,
    )

    const icon = container.querySelector("svg.game-card-icon")
    expect(icon).not.toBeNull()
    // 自绘 GBA 掌机图标：单条 evenodd 路径承载机身与镂空，而非 lucide 通用手柄
    expect(icon?.querySelectorAll("path")).toHaveLength(1)
    expect(icon?.querySelector("path")?.getAttribute("fill-rule")).toBe("evenodd")
    expect(icon?.classList.contains("lucide-gamepad-2")).toBe(false)
    // 导入区配色：始终挂 --imported 修饰类与琥珀色，与内置区绿色卡片区分
    expect(icon?.classList.contains("game-card-icon--imported")).toBe(true)
    expect(icon?.classList.contains("text-amber-400")).toBe(true)
  })

  it("更多按钮为默认 solid 变体、带主题边框的 small 档位 LxIconButton", () => {
    render(
      <GameCard entry={createEntry()} onPlay={vi.fn()} onRename={vi.fn()} onRemove={vi.fn()} />,
    )

    const moreButton = screen.getByRole("button", { name: "More actions" })
    // 默认 solid 变体：像素 主题据此套用像素描边按钮，与相邻「导入」标签一致
    expect(moreButton.getAttribute("data-variant")).toBe("solid")
    expect(moreButton.className).toContain("h-6")
    expect(moreButton.className).toContain("w-6")
    expect(moreButton.className).toContain("rounded-[6px]")
    expect(moreButton.className).toContain("border border-[var(--color-theme-border)]")
    // 默认主题下不加底色，只保留描边
    expect(moreButton.className).not.toContain("bg-[var(--color-theme-surface)]")
    expect(moreButton.className).toContain("focus-visible:outline")
    // 不覆盖组件默认配色：沿用 text-white/45 + hover:bg-white/10 hover:text-white
    expect(moreButton.className).toContain("text-white/45")
    expect(moreButton.className).toContain("hover:bg-white/10")
    expect(moreButton.className).toContain("hover:text-white")
  })

  it("点击卡片主体触发播放", () => {
    const onPlay = vi.fn()
    const entry = createEntry()
    render(<GameCard entry={entry} onPlay={onPlay} onRename={vi.fn()} onRemove={vi.fn()} />)

    fireEvent.click(screen.getByText("Demo Game"))

    expect(onPlay).toHaveBeenCalledWith(entry)
  })

  it("菜单重命名成功后提交新标题", async () => {
    const onRename = vi.fn().mockResolvedValue(true)
    const entry = createEntry()
    render(<GameCard entry={entry} onPlay={vi.fn()} onRename={onRename} onRemove={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(await screen.findByText("Rename"))

    const input = await screen.findByPlaceholderText("Enter card title")
    fireEvent.change(input, { target: { value: "新的标题" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(onRename).toHaveBeenCalledWith(entry, "新的标题")
  })

  it("菜单删除需二次确认后才触发删除", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined)
    const entry = createEntry()
    render(<GameCard entry={entry} onPlay={vi.fn()} onRename={vi.fn()} onRemove={onRemove} />)

    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(await screen.findByText("Delete"))
    expect(onRemove).not.toHaveBeenCalled()

    const confirmButton = document.querySelector<HTMLButtonElement>('button[aria-label="Confirm"]')
    expect(confirmButton).not.toBeNull()
    if (confirmButton) fireEvent.click(confirmButton)

    expect(onRemove).toHaveBeenCalledWith(entry)
  })

  it("取消删除不触发删除", async () => {
    const onRemove = vi.fn()
    render(
      <GameCard entry={createEntry()} onPlay={vi.fn()} onRename={vi.fn()} onRemove={onRemove} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "More actions" }))
    fireEvent.click(await screen.findByText("Delete"))
    const cancelButton = document.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')
    expect(cancelButton).not.toBeNull()
    if (cancelButton) fireEvent.click(cancelButton)

    expect(onRemove).not.toHaveBeenCalled()
  })
})
