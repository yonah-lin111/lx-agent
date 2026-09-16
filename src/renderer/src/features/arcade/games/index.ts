import type { ArcadeGame, ArcadeGameId } from "../types"
import { createCakeGame } from "./cake/game"
import { createDodgeGame } from "./dodge/game"
import { createTetrisGame } from "./tetris/game"

/**
 * 按标识创建小游戏运行时实例。
 */
export const createArcadeGame = (gameId: ArcadeGameId): ArcadeGame => {
  if (gameId === "dodge") return createDodgeGame()
  if (gameId === "cake") return createCakeGame()
  return createTetrisGame()
}
