import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { useTranslation } from "@/i18n"
import { useAppThemeValue } from "@/stores/themeStore"
import { BUILTIN_GAME_META } from "../constants"
import { getBuiltinPalette } from "../palette"
import type { BuiltinGameId } from "../types"
import { BuiltinGameCanvasHost } from "./BuiltinGameCanvasHost"

export interface BuiltinGameStageProps {
  gameId: BuiltinGameId
  // 各内置游戏最高分（由游戏列表持有，运行结束后回写展示）。
  bestScores: Record<string, number>
  // 提交本局得分，返回是否刷新最高分。
  submitScore: (gameId: string, score: number) => boolean
  onExit: () => void
}

interface BuiltinResult {
  score: number
  isNewBest: boolean
}

/**
 * 内置游戏舞台：整页运行单个内置小游戏，负责运行 → 暂停 / 结算，退出回到游戏列表。
 */
export const BuiltinGameStage = ({
  gameId,
  bestScores,
  submitScore,
  onExit,
}: BuiltinGameStageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const theme = useAppThemeValue()
  const palette = getBuiltinPalette(theme)

  const [isPaused, setIsPaused] = useState(false)
  const [result, setResult] = useState<BuiltinResult | null>(null)
  const [runId, setRunId] = useState(0)

  const activeGame = BUILTIN_GAME_META[gameId]
  const isRunning = !isPaused && result === null

  const handleExit = useCallback((): void => {
    setIsPaused(false)
    setResult(null)
    onExit()
  }, [onExit])

  // ESC：运行中由画布宿主接管并转为暂停，其余状态一律退出舞台。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || isRunning) return
      onExit()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isRunning, onExit])

  const handleRestart = useCallback((): void => {
    setIsPaused(false)
    setResult(null)
    setRunId((current) => current + 1)
  }, [])

  const handleGameOver = useCallback(
    (score: number): void => {
      setResult({ score, isNewBest: submitScore(gameId, score) })
    },
    [gameId, submitScore],
  )

  return (
    <div className="game-builtin-stage flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
      {/* 工具栏 */}
      <div className="game-builtin-stage-toolbar flex min-w-0 shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <LxIconButton
            size="small"
            aria-label={t("game.stage.back")}
            title={{ content: t("game.stage.back"), placement: "bottom" }}
            onClick={handleExit}
          >
            <ArrowLeft />
          </LxIconButton>
          <span className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
            {t(activeGame.nameKey)}
          </span>
          <span className="shrink-0 font-mono text-xs text-[var(--color-theme-text-subtle)]">
            {t("game.builtin.best")}: {bestScores[gameId] ?? 0}
          </span>
          <LxInfoTooltip markdown={t(activeGame.infoKey)} />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!result && (
            <LxIconButton
              size="small"
              aria-label={isPaused ? t("game.builtin.resume") : t("game.builtin.pause")}
              title={{
                content: isPaused ? t("game.builtin.resume") : t("game.builtin.pause"),
                placement: "bottom",
              }}
              onClick={() => setIsPaused((current) => !current)}
            >
              {isPaused ? <Play /> : <Pause />}
            </LxIconButton>
          )}
          <LxIconButton
            size="small"
            aria-label={t("game.builtin.restart")}
            title={{ content: t("game.builtin.restart"), placement: "bottom" }}
            onClick={handleRestart}
          >
            <RotateCcw />
          </LxIconButton>
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1">
        <BuiltinGameCanvasHost
          gameId={gameId}
          runId={runId}
          palette={palette}
          isPaused={isPaused || result !== null}
          onGameOver={handleGameOver}
          onPauseRequest={() => setIsPaused(true)}
        />

        {isPaused && !result ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
            <span className="font-mono text-sm font-semibold tracking-widest text-white/85">
              {t("game.builtin.paused")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-[var(--theme-radius-base)] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
                onClick={() => setIsPaused(false)}
              >
                {t("game.builtin.resume")}
              </button>
              <button
                type="button"
                className="rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                onClick={handleRestart}
              >
                {t("game.builtin.restart")}
              </button>
              <button
                type="button"
                className="rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                onClick={handleExit}
              >
                {t("game.stage.back")}
              </button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/65 backdrop-blur-sm">
            <span className="text-xs font-medium tracking-wide text-white/60">
              {t("game.builtin.result.title")}
            </span>
            <span className="font-mono text-lg font-bold text-white">{result.score}</span>
            <span className="font-mono text-xs text-white/60">
              {result.isNewBest
                ? t("game.builtin.result.newBest")
                : `${t("game.builtin.result.best")}: ${bestScores[gameId] ?? 0}`}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                className="rounded-[var(--theme-radius-base)] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
                onClick={handleRestart}
              >
                {t("game.builtin.result.playAgain")}
              </button>
              <button
                type="button"
                className="rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                onClick={handleExit}
              >
                {t("game.builtin.result.pickAnother")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
