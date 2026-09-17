import type { LucideIcon } from "lucide-react"
import { Blocks, Cake, Sparkles } from "lucide-react"
import type { TranslationKey } from "@/i18n"
import type { BuiltinGameId } from "./types"

// 画布逻辑分辨率（CSS 等比缩放适配容器）。
export const BUILTIN_WIDTH = 960
export const BUILTIN_HEIGHT = 600

// 最高分持久化键。
export const BUILTIN_BEST_SCORES_STORAGE_KEY = "lx_game_builtin_best_v1"

// 内置游戏元信息（文案全部走 i18n）。
export interface BuiltinGameMeta {
  id: BuiltinGameId
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  controlsKey: TranslationKey
  // 玩法与计分说明（Markdown，供 LxInfoTooltip 展示）。
  infoKey: TranslationKey
  icon: LucideIcon
}

// 按 id 索引的内置游戏元信息（id 与类型一一对应，查找必然命中）。
export const BUILTIN_GAME_META: Record<BuiltinGameId, BuiltinGameMeta> = {
  tetris: {
    id: "tetris",
    nameKey: "game.builtin.games.tetris.name",
    descriptionKey: "game.builtin.games.tetris.description",
    controlsKey: "game.builtin.games.tetris.controls",
    infoKey: "game.builtin.games.tetris.info",
    icon: Blocks,
  },
  dodge: {
    id: "dodge",
    nameKey: "game.builtin.games.dodge.name",
    descriptionKey: "game.builtin.games.dodge.description",
    controlsKey: "game.builtin.games.dodge.controls",
    infoKey: "game.builtin.games.dodge.info",
    icon: Sparkles,
  },
  cake: {
    id: "cake",
    nameKey: "game.builtin.games.cake.name",
    descriptionKey: "game.builtin.games.cake.description",
    controlsKey: "game.builtin.games.cake.controls",
    infoKey: "game.builtin.games.cake.info",
    icon: Cake,
  },
}

// 内置游戏列表（按展示顺序）。
export const BUILTIN_GAMES: BuiltinGameMeta[] = Object.values(BUILTIN_GAME_META)
