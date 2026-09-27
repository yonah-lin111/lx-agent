import { Pause, Play, RotateCcw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { GamePauseOverlay } from "@/features/game/components/GamePauseOverlay"
import { useTranslation } from "@/i18n"
import { useAppThemeValue } from "@/stores/themeStore"
import { BUILTIN_GAME_META } from "../constants"
import { getBuiltinPalette } from "../palette"
import type { BuiltinGameId } from "../types"
import { BuiltinGameCanvasHost } from "./BuiltinGameCanvasHost"

export interface BuiltinGameStageProps {
  gameId: BuiltinGameId
  // 各内置游戏最高分（由游戏库持有，运行结束后回写展示）。
  bestScores: Record<string, number>
  // 提交本局得分，返回是否刷新最高分。
  submitScore: (gameId: string, score: number) => boolean
  // 覆盖层收起（最小化）时为 true：强制暂停并保留本局状态。
  isSuspended: boolean
  // 结算面板"换一个游戏"：结束会话并回到游戏库。
  onBackToLibrary: () => void
}

interface BuiltinResult {
  score: number
  isNewBest: boolean
}

/**
 * 内置游戏舞台：运行 → 暂停 / 结算；ESC 只暂停不退出，关闭入口由覆盖层顶栏提供。
 */
export const BuiltinGameStage = ({
  gameId,
  bestScores,
  submitScore,
  isSuspended,
  onBackToLibrary,
}: BuiltinGameStageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const theme = useAppThemeValue()
  const palette = getBuiltinPalette(theme)

  const [isPaused, setIsPaused] = useState(false)
  const [result, setResult] = useState<BuiltinResult | null>(null)
  const [runId, setRunId] = useState(0)

  const activeGame = BUILTIN_GAME_META[gameId]

  // 最小化到顶部栏入口时强制暂停，恢复展开后保持暂停态等待用户继续。
  useEffect(() => {
    if (isSuspended) setIsPaused(true)
  }, [isSuspended])

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
          isPaused={isPaused || result !== null || isSuspended}
          onGameOver={handleGameOver}
          onPauseRequest={() => setIsPaused(true)}
        />

        {isPaused && !result ? (
          <GamePauseOverlay onResume={() => setIsPaused(false)} onRestart={handleRestart} />
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
                onClick={onBackToLibrary}
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
