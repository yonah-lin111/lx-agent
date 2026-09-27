import type React from "react"
import { useTranslation } from "@/i18n"

// 暂停面板属性：继续为必备动作，其余按钮按需渲染。
export interface GamePauseOverlayProps {
  onResume: () => void
  onRestart?: () => void
  onMinimize?: () => void
  onClose?: () => void
}

const PRIMARY_BUTTON_CLASS =
  "rounded-[var(--theme-radius-base)] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
const SECONDARY_BUTTON_CLASS =
  "rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"

/**
 * 游戏暂停遮罩：覆盖游戏画面，提供继续 / 重开 / 最小化 / 关闭入口。
 */
export const GamePauseOverlay = ({
  onResume,
  onRestart,
  onMinimize,
  onClose,
}: GamePauseOverlayProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="game-pause-overlay absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
      <span className="font-mono text-sm font-semibold tracking-widest text-white/85">
        {t("game.pause.paused")}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={PRIMARY_BUTTON_CLASS} onClick={onResume}>
          {t("game.pause.resume")}
        </button>
        {onRestart ? (
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onRestart}>
            {t("game.pause.restart")}
          </button>
        ) : null}
        {onMinimize ? (
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onMinimize}>
            {t("game.pause.minimize")}
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
            {t("game.pause.close")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
