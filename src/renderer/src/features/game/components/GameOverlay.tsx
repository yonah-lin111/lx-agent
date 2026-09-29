import { Gamepad2, Minus, X } from "lucide-react"
import type React from "react"
import { useRef } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { BuiltinGameStage } from "@/features/game/builtin/components/BuiltinGameStage"
import { BUILTIN_GAME_META } from "@/features/game/builtin/constants"
import { useBuiltinBestScores } from "@/features/game/builtin/hooks/useBuiltinBestScores"
import { GameDashboard } from "@/features/game/components/GameDashboard"
import { GameStage } from "@/features/game/components/GameStage"
import { useGameSessionStore } from "@/features/game/hooks/useGameSessionStore"
import { useTranslation } from "@/i18n"

/**
 * 游戏覆盖层：App 级常驻，切页不卸载；无会话时展示游戏库，有会话时展示舞台，
 * 最小化仅以 CSS 隐藏（会话与画面状态保留），由顶部栏游戏入口恢复。
 */
export const GameOverlay = (): React.JSX.Element | null => {
  const { t } = useTranslation()
  const session = useGameSessionStore((state) => state.session)
  const isOpen = useGameSessionStore((state) => state.isOpen)
  const minimize = useGameSessionStore((state) => state.minimize)
  const close = useGameSessionStore((state) => state.close)
  const backToLibrary = useGameSessionStore((state) => state.backToLibrary)
  const { bestScores, submitScore } = useBuiltinBestScores()
  // 覆盖层容器：舞台内的快捷键弹窗挂载其中，避免遮罩盖住整个应用窗口。
  const overlayRef = useRef<HTMLElement | null>(null)

  if (!session && !isOpen) return null

  const title = session
    ? session.kind === "rom"
      ? session.entry.title
      : t(BUILTIN_GAME_META[session.gameId].nameKey)
    : t("game.title")

  return (
    <section
      ref={overlayRef}
      aria-label={t("game.title")}
      className={`game-overlay absolute inset-0 z-[60] flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] ${
        isOpen ? "" : "hidden"
      }`}
    >
      <div className="game-overlay-toolbar flex min-w-0 shrink-0 items-center gap-2 border-b border-[var(--color-theme-border)] px-3 py-2">
        <Gamepad2 className="game-section-icon game-section-icon--game h-4 w-4 shrink-0 text-amber-400" />
        <span className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
          {title}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <LxIconButton
            size="small"
            aria-label={t("game.overlay.minimize")}
            title={{ content: t("game.overlay.minimize"), placement: "bottom" }}
            onClick={minimize}
          >
            <Minus />
          </LxIconButton>
          <LxIconButton
            size="small"
            aria-label={t("game.overlay.close")}
            title={{ content: t("game.overlay.close"), placement: "bottom" }}
            onClick={close}
          >
            <X />
          </LxIconButton>
        </div>
      </div>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {session?.kind === "rom" ? (
          <GameStage
            entry={session.entry}
            isSuspended={!isOpen}
            modalContainerRef={overlayRef}
            onMinimize={minimize}
            onClose={close}
          />
        ) : null}

        {session?.kind === "builtin" ? (
          <BuiltinGameStage
            gameId={session.gameId}
            bestScores={bestScores}
            submitScore={submitScore}
            isSuspended={!isOpen}
            onBackToLibrary={backToLibrary}
          />
        ) : null}

        {!session ? <GameDashboard /> : null}
      </div>
    </section>
  )
}
