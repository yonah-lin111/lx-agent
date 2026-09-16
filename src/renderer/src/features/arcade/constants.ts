import type { LucideIcon } from "lucide-react"
import { Route, Sparkles, Wind } from "lucide-react"
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
  icon: LucideIcon
  iconClassName: string
}

export const ARCADE_GAMES: ArcadeGameMeta[] = [
  {
    id: "oneStroke",
    nameKey: "arcade.games.oneStroke.name",
    descriptionKey: "arcade.games.oneStroke.description",
    controlsKey: "arcade.games.oneStroke.controls",
    icon: Route,
    iconClassName: "text-emerald-400",
  },
  {
    id: "dodge",
    nameKey: "arcade.games.dodge.name",
    descriptionKey: "arcade.games.dodge.description",
    controlsKey: "arcade.games.dodge.controls",
    icon: Sparkles,
    iconClassName: "text-sky-400",
  },
  {
    id: "runner",
    nameKey: "arcade.games.runner.name",
    descriptionKey: "arcade.games.runner.description",
    controlsKey: "arcade.games.runner.controls",
    icon: Wind,
    iconClassName: "text-amber-400",
  },
]
