import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxTag } from "@/components/ui/LxTag"
import type { BuiltinGameMeta } from "@/features/game/builtin/constants"
import type { BuiltinGameId } from "@/features/game/builtin/types"
import { useTranslation } from "@/i18n"

export interface BuiltinGameCardProps {
  meta: BuiltinGameMeta
  bestScore: number
  onPlay: (gameId: BuiltinGameId) => void
}

/**
 * 内置游戏卡片：展示名称 / 简介 / 操作提示 / 最高分，点击直接开局。
 */
export const BuiltinGameCard = ({
  meta,
  bestScore,
  onPlay,
}: BuiltinGameCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const Icon = meta.icon

  return (
    <div className="builtin-game-card flex min-w-0 flex-col gap-2 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-4 transition-colors hover:border-[var(--color-theme-border-strong)] hover:bg-[var(--color-theme-surface-hover)]">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Icon className={`game-card-icon h-5 w-5 shrink-0 ${meta.iconClassName}`} />
        <div className="flex min-w-0 shrink-0 items-center gap-1.5">
          <LxTag size="small">{t("game.builtin.tag")}</LxTag>
          <LxInfoTooltip markdown={t(meta.infoKey)} />
        </div>
      </div>

      <button
        type="button"
        data-variant="ghost"
        className="flex min-w-0 cursor-pointer flex-col gap-1 text-left"
        onClick={() => onPlay(meta.id)}
      >
        <span className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
          {t(meta.nameKey)}
        </span>
        <span className="truncate text-xs text-[var(--color-theme-text-muted)]">
          {t(meta.descriptionKey)}
        </span>
        <span className="text-[11px] leading-relaxed text-[var(--color-theme-text-subtle)]">
          {t(meta.controlsKey)}
        </span>
      </button>

      <span className="mt-auto truncate font-mono text-xs text-[var(--color-theme-text-muted)]">
        {t("game.builtin.best")}: {bestScore}
      </span>
    </div>
  )
}
