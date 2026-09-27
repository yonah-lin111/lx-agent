import type { GameRomEntry } from "@shared/contracts/game"
import { beforeEach, describe, expect, it } from "vitest"
import { useGameSessionStore } from "@/features/game"

const createEntry = (patch: Partial<GameRomEntry> = {}): GameRomEntry => ({
  id: 1,
  title: "Demo Game",
  romHash: "a".repeat(64),
  romSize: 1048576,
  createdAt: "2026-09-17T00:00:00.000Z",
  updatedAt: "2026-09-17T00:00:00.000Z",
  lastPlayedAt: null,
  ...patch,
})

describe("useGameSessionStore", () => {
  beforeEach(() => {
    useGameSessionStore.setState({ session: null, isOpen: false })
  })

  it("startRom / startBuiltin 单槽位覆盖旧会话并展开覆盖层", () => {
    useGameSessionStore.getState().startRom(createEntry())
    expect(useGameSessionStore.getState().session).toEqual({
      kind: "rom",
      entry: createEntry(),
    })
    expect(useGameSessionStore.getState().isOpen).toBe(true)

    useGameSessionStore.getState().startBuiltin("dodge")
    expect(useGameSessionStore.getState().session).toEqual({ kind: "builtin", gameId: "dodge" })
    expect(useGameSessionStore.getState().isOpen).toBe(true)
  })

  it("toggle 在开与收之间切换（无会话时展开即游戏库）", () => {
    useGameSessionStore.getState().toggle()
    expect(useGameSessionStore.getState().isOpen).toBe(true)
    expect(useGameSessionStore.getState().session).toBeNull()

    useGameSessionStore.getState().toggle()
    expect(useGameSessionStore.getState().isOpen).toBe(false)
  })

  it("minimize 保留会话只收起覆盖层", () => {
    useGameSessionStore.getState().startBuiltin("tetris")
    useGameSessionStore.getState().minimize()

    expect(useGameSessionStore.getState().isOpen).toBe(false)
    expect(useGameSessionStore.getState().session).toEqual({ kind: "builtin", gameId: "tetris" })
  })

  it("close 清空会话并收起覆盖层", () => {
    useGameSessionStore.getState().startRom(createEntry())
    useGameSessionStore.getState().close()

    expect(useGameSessionStore.getState().session).toBeNull()
    expect(useGameSessionStore.getState().isOpen).toBe(false)
  })

  it("backToLibrary 清空会话但保持覆盖层展开", () => {
    useGameSessionStore.getState().startRom(createEntry())
    useGameSessionStore.getState().backToLibrary()

    expect(useGameSessionStore.getState().session).toBeNull()
    expect(useGameSessionStore.getState().isOpen).toBe(true)
  })
})
