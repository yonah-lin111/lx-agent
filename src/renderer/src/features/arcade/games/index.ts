import type { ArcadeGame, ArcadeGameId } from "../types"
import { createDodgeGame } from "./dodge/game"
import { createOneStrokeGame } from "./oneStroke/game"
import { createRunnerGame } from "./runner/game"

/**
 * 按标识创建小游戏运行时实例。
 */
export const createArcadeGame = (gameId: ArcadeGameId): ArcadeGame => {
  if (gameId === "dodge") return createDodgeGame()
  if (gameId === "runner") return createRunnerGame()
  return createOneStrokeGame()
}
