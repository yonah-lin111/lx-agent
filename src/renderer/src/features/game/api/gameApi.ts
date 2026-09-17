import type { GameImportResult, GameRomEntry, GameRuntimeConfig } from "@shared/contracts/game"

/**
 * 隔离游戏功能对 Electron preload API 的直接依赖。
 */
export const gameApi = {
  list: (): Promise<GameRomEntry[]> => window.api.game.list(),
  importFromDialog: (): Promise<GameImportResult[]> => window.api.game.importFromDialog(),
  rename: (id: number, title: string): Promise<GameRomEntry> => window.api.game.rename(id, title),
  remove: (id: number): Promise<void> => window.api.game.remove(id),
  markPlayed: (id: number): Promise<GameRomEntry> => window.api.game.markPlayed(id),
  writeSave: (id: number, data: Uint8Array): Promise<void> => window.api.game.writeSave(id, data),
  getRuntimeConfig: (): Promise<GameRuntimeConfig> => window.api.game.getRuntimeConfig(),
}
