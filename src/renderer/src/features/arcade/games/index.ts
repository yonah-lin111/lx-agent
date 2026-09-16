import type { ArcadeGame, ArcadeGameId } from "../types"
import { createDodgeGame } from "./dodge/game"
import { createHopGame } from "./hop/game"
import { createTetrisGame } from "./tetris/game"

/**
 * 按标识创建小游戏运行时实例。
 */
export const createArcadeGame = (gameId: ArcadeGameId): ArcadeGame => {
  if (gameId === "dodge") return createDodgeGame()
  if (gameId === "hop") return createHopGame()
  return createTetrisGame()
}
