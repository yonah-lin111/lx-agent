import { useTranslation } from "@/i18n"
import { ARCADE_GAMES } from "../constants"
import type { ArcadeGameId } from "../types"

export interface ArcadeGamePickerProps {
  bestScores: Record<string, number>
  onSelect: (gameId: ArcadeGameId) => void
}

/**
 * 彩蛋游戏选择列表。
 */
export const ArcadeGamePicker = ({
  bestScores,
  onSelect,
}: ArcadeGamePickerProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-full flex-col gap-3">
      <p className="text-xs leading-relaxed text-[var(--color-theme-text-muted)]">
        {t("arcade.picker.subtitle")}
      </p>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
        {ARCADE_GAMES.map((game) => {
          const Icon = game.icon
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => onSelect(game.id)}
              className="arcade-game-card flex min-w-0 flex-col gap-2 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-4 text-left transition-colors hover:border-[var(--color-theme-border-strong)] hover:bg-[var(--color-theme-surface-hover)]"
            >
              <Icon className={`h-5 w-5 shrink-0 ${game.iconClassName}`} />
              <span className="text-sm font-semibold text-[var(--color-theme-text)]">
                {t(game.nameKey)}
              </span>
              <span className="text-xs leading-relaxed text-[var(--color-theme-text-muted)]">
                {t(game.descriptionKey)}
              </span>
              <span className="text-[11px] leading-relaxed text-[var(--color-theme-text-subtle)]">
                {t(game.controlsKey)}
              </span>
              <span className="mt-auto pt-2 font-mono text-xs text-[var(--color-theme-text-muted)]">
                {t("arcade.picker.best")}: {bestScores[game.id] ?? 0}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
