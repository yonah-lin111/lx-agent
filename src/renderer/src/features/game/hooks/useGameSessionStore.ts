import type { GameRomEntry } from "@shared/contracts/game"
import { create } from "zustand"
import type { BuiltinGameId } from "@/features/game/builtin/types"

// 游戏会话：同一时刻最多存在一个（单槽位，新开局覆盖旧会话）。
export type GameSession =
  | { kind: "rom"; entry: GameRomEntry }
  | { kind: "builtin"; gameId: BuiltinGameId }

interface GameSessionState {
  // 当前会话；null 表示无会话（覆盖层展示游戏库）。
  session: GameSession | null
  // 覆盖层是否展开；会话存在但收起时为"最小化到顶部栏"。
  isOpen: boolean
  startRom: (entry: GameRomEntry) => void
  startBuiltin: (gameId: BuiltinGameId) => void
  toggle: () => void
  minimize: () => void
  close: () => void
  backToLibrary: () => void
}

/**
 * 游戏会话 Store：驱动覆盖层显隐、单会话槽位与顶部栏游戏入口状态。
 */
export const useGameSessionStore = create<GameSessionState>((set) => ({
  session: null,
  isOpen: false,
  startRom: (entry) => set({ session: { kind: "rom", entry }, isOpen: true }),
  startBuiltin: (gameId) => set({ session: { kind: "builtin", gameId }, isOpen: true }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
  minimize: () => set({ isOpen: false }),
  close: () => set({ session: null, isOpen: false }),
  backToLibrary: () => set({ session: null, isOpen: true }),
}))
