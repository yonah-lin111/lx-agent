import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react"
import { useCallback, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxModal } from "@/components/ui/LxModal"
import { useTranslation } from "@/i18n"
import { useAppThemeValue } from "@/stores/themeStore"
import { ARCADE_GAMES } from "../constants"
import { useArcadeBestScores } from "../hooks/useArcadeBestScores"
import { getArcadePalette } from "../palette"
import type { ArcadeGameId } from "../types"
import { ArcadeCanvasHost } from "./ArcadeCanvasHost"
import { ArcadeGamePicker } from "./ArcadeGamePicker"

export interface ArcadeModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ArcadeResult {
  score: number
  isNewBest: boolean
}

/**
 * 彩蛋游戏厅：游戏选择 → 运行 → 暂停/结算，全部复用 LxModal 容器。
 */
export const ArcadeModal = ({ isOpen, onClose }: ArcadeModalProps): React.JSX.Element => {
  const { t } = useTranslation()
  const theme = useAppThemeValue()
  const palette = getArcadePalette(theme)
  const { bestScores, submitScore } = useArcadeBestScores()

  const [activeGameId, setActiveGameId] = useState<ArcadeGameId | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [result, setResult] = useState<ArcadeResult | null>(null)
  const [runId, setRunId] = useState(0)

  const activeGame = ARCADE_GAMES.find((game) => game.id === activeGameId) ?? null

  const handleClose = useCallback((): void => {
    setActiveGameId(null)
    setIsPaused(false)
    setResult(null)
    onClose()
  }, [onClose])

  const handleSelectGame = useCallback((gameId: ArcadeGameId): void => {
    setActiveGameId(gameId)
    setIsPaused(false)
    setResult(null)
    setRunId((current) => current + 1)
  }, [])

  const handleRestart = useCallback((): void => {
    setIsPaused(false)
    setResult(null)
    setRunId((current) => current + 1)
  }, [])

  const handleGameOver = useCallback(
    (score: number): void => {
      if (!activeGameId) return
      setResult({ score, isNewBest: submitScore(activeGameId, score) })
    },
    [activeGameId, submitScore],
  )

  return (
    <LxModal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("arcade.title")}
      width="920px"
      height="700px"
      maxWidth="94vw"
      maxHeight="92vh"
    >
      {activeGameId && activeGame ? (
        <div className="flex min-h-full min-w-0 flex-col gap-3">
          {/* 游戏工具栏 */}
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <LxIconButton
                size="small"
                aria-label={t("arcade.backToList")}
                title={{ content: t("arcade.backToList"), placement: "bottom" }}
                onClick={() => {
                  setActiveGameId(null)
                  setResult(null)
                  setIsPaused(false)
                }}
              >
                <ArrowLeft />
              </LxIconButton>
              <span className="truncate text-sm font-semibold text-white/90">
                {t(activeGame.nameKey)}
              </span>
              <span className="shrink-0 font-mono text-xs text-white/45">
                {t("arcade.picker.best")}: {bestScores[activeGame.id] ?? 0}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {!result && (
                <LxIconButton
                  size="small"
                  aria-label={isPaused ? t("arcade.resume") : t("arcade.pause")}
                  title={{
                    content: isPaused ? t("arcade.resume") : t("arcade.pause"),
                    placement: "bottom",
                  }}
                  onClick={() => setIsPaused((current) => !current)}
                >
                  {isPaused ? <Play /> : <Pause />}
                </LxIconButton>
              )}
              <LxIconButton
                size="small"
                aria-label={t("arcade.restart")}
                title={{ content: t("arcade.restart"), placement: "bottom" }}
                onClick={handleRestart}
              >
                <RotateCcw />
              </LxIconButton>
            </div>
          </div>

          {/* 画布与覆盖层 */}
          <div className="relative min-w-0">
            <ArcadeCanvasHost
              gameId={activeGameId}
              runId={runId}
              palette={palette}
              isPaused={isPaused || result !== null}
              onGameOver={handleGameOver}
              onPauseRequest={() => setIsPaused(true)}
            />

            {isPaused && !result ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[var(--theme-radius-base)] bg-black/60 backdrop-blur-sm">
                <span className="font-mono text-sm font-semibold tracking-widest text-white/85">
                  {t("arcade.paused")}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-[var(--theme-radius-base)] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
                    onClick={() => setIsPaused(false)}
                  >
                    {t("arcade.resume")}
                  </button>
                  <button
                    type="button"
                    className="rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                    onClick={handleRestart}
                  >
                    {t("arcade.restart")}
                  </button>
                  <button
                    type="button"
                    className="rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                    onClick={handleClose}
                  >
                    {t("arcade.close")}
                  </button>
                </div>
              </div>
            ) : null}

            {result ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[var(--theme-radius-base)] bg-black/65 backdrop-blur-sm">
                <span className="text-xs font-medium tracking-wide text-white/60">
                  {t("arcade.result.title")}
                </span>
                <span className="font-mono text-3xl font-bold text-white">{result.score}</span>
                <span className="font-mono text-xs text-white/60">
                  {result.isNewBest ? t("arcade.result.newBest") : t("arcade.result.best")}
                  {result.isNewBest ? "" : `: ${bestScores[activeGameId] ?? 0}`}
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-[var(--theme-radius-base)] border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
                    onClick={handleRestart}
                  >
                    {t("arcade.result.playAgain")}
                  </button>
                  <button
                    type="button"
                    className="rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10"
                    onClick={() => {
                      setActiveGameId(null)
                      setResult(null)
                    }}
                  >
                    {t("arcade.result.pickAnother")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <ArcadeGamePicker bestScores={bestScores} onSelect={handleSelectGame} />
      )}
    </LxModal>
  )
}
