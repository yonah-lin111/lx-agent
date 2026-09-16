import type { LucideIcon } from "lucide-react"
import { Blocks, Cake, Sparkles } from "lucide-react"
import type { TranslationKey } from "@/i18n"
import type { ArcadeGameId } from "./types"

// 画布逻辑分辨率（CSS 等比缩放适配容器）。
export const ARCADE_WIDTH = 960
export const ARCADE_HEIGHT = 600

// 最高分持久化键。
export const ARCADE_BEST_SCORES_STORAGE_KEY = "lx_arcade_best_v1"

// 小游戏元信息（文案全部走 i18n）。
export interface ArcadeGameMeta {
  id: ArcadeGameId
  nameKey: TranslationKey
  descriptionKey: TranslationKey
  controlsKey: TranslationKey
  // 玩法与计分说明（Markdown，供 LxInfoTooltip 展示）。
  infoKey: TranslationKey
  icon: LucideIcon
  iconClassName: string
}

export const ARCADE_GAMES: ArcadeGameMeta[] = [
  {
    id: "tetris",
    nameKey: "arcade.games.tetris.name",
    descriptionKey: "arcade.games.tetris.description",
    controlsKey: "arcade.games.tetris.controls",
    infoKey: "arcade.games.tetris.info",
    icon: Blocks,
    iconClassName: "text-emerald-400",
  },
  {
    id: "dodge",
    nameKey: "arcade.games.dodge.name",
    descriptionKey: "arcade.games.dodge.description",
    controlsKey: "arcade.games.dodge.controls",
    infoKey: "arcade.games.dodge.info",
    icon: Sparkles,
    iconClassName: "text-sky-400",
  },
  {
    id: "cake",
    nameKey: "arcade.games.cake.name",
    descriptionKey: "arcade.games.cake.description",
    controlsKey: "arcade.games.cake.controls",
    infoKey: "arcade.games.cake.info",
    icon: Cake,
    iconClassName: "text-amber-400",
  },
]
