import type { BuiltinGame, BuiltinGameId } from "../types"
import { createCakeGame } from "./cake/game"
import { createDodgeGame } from "./dodge/game"
import { createTetrisGame } from "./tetris/game"

/**
 * 按标识创建内置游戏运行时实例。
 */
export const createBuiltinGame = (gameId: BuiltinGameId): BuiltinGame => {
  if (gameId === "dodge") return createDodgeGame()
  if (gameId === "cake") return createCakeGame()
  return createTetrisGame()
}
