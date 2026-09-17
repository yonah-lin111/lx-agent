import type { GameRomEntry } from "@shared/contracts/game"
import { Gamepad2, Joystick, MemoryStick, Plus } from "lucide-react"
import type React from "react"
import { useCallback, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { useLxToast } from "@/components/ui/LxToast"
import { BuiltinGameStage } from "@/features/game/builtin/components/BuiltinGameStage"
import { BUILTIN_GAMES } from "@/features/game/builtin/constants"
import { useBuiltinBestScores } from "@/features/game/builtin/hooks/useBuiltinBestScores"
import type { BuiltinGameId } from "@/features/game/builtin/types"
import { BuiltinGameCard } from "@/features/game/components/BuiltinGameCard"
import { GameCard } from "@/features/game/components/GameCard"
import { GameStage } from "@/features/game/components/GameStage"
import { useGameEntries } from "@/features/game/hooks/useGameEntries"
import { GAME_INVALID_REASON_KEYS } from "@/features/game/utils"
import { useTranslation } from "@/i18n"

/**
 * 渲染游戏视图：内置小游戏与导入的本地 GBA ROM 分区展示，点卡片进入对应游戏舞台。
 */
export const GameDashboard = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { success, error, info } = useLxToast()
  const { entries, isLoading, hasError, reload, importFromDialog, rename, remove } =
    useGameEntries()
  const { bestScores, submitScore } = useBuiltinBestScores()

  const [activeEntry, setActiveEntry] = useState<GameRomEntry | null>(null)
  const [activeBuiltinGameId, setActiveBuiltinGameId] = useState<BuiltinGameId | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleImport = useCallback(async (): Promise<void> => {
    if (isImporting) return
    setIsImporting(true)
    try {
      const results = await importFromDialog()
      if (results.length === 0) return

      const importedCount = results.filter((result) => result.status === "imported").length
      if (importedCount > 0) {
        success(t("game.importResult.imported", { count: importedCount }))
      }
      for (const result of results) {
        if (result.status === "duplicated") {
          info(
            t("game.importResult.duplicated", {
              title: result.entry?.title ?? result.fileName,
            }),
          )
        }
        if (result.status === "invalid") {
          error(
            t("game.importResult.invalid", {
              file: result.fileName,
              reason: t(GAME_INVALID_REASON_KEYS[result.reason ?? "unreadable"]),
            }),
          )
        }
      }
      await reload()
    } catch {
      error(t("game.error.importFailed"))
    } finally {
      setIsImporting(false)
    }
  }, [error, importFromDialog, info, isImporting, reload, success, t])

  const handleRename = useCallback(
    async (entry: GameRomEntry, title: string): Promise<boolean> => {
      try {
        await rename(entry.id, title)
        return true
      } catch {
        error(t("game.error.renameFailed"))
        return false
      }
    },
    [error, rename, t],
  )

  const handleRemove = useCallback(
    async (entry: GameRomEntry): Promise<void> => {
      try {
        await remove(entry.id)
        success(t("game.remove.success", { title: entry.title }))
      } catch {
        error(t("game.error.removeFailed"))
      }
    },
    [error, remove, success, t],
  )

  const handleStageExit = useCallback((): void => {
    setActiveEntry(null)
    void reload()
  }, [reload])

  if (activeEntry) {
    return <GameStage entry={activeEntry} onExit={handleStageExit} />
  }

  if (activeBuiltinGameId) {
    return (
      <BuiltinGameStage
        gameId={activeBuiltinGameId}
        bestScores={bestScores}
        submitScore={submitScore}
        onExit={() => setActiveBuiltinGameId(null)}
      />
    )
  }

  return (
    <div className="game-dashboard relative flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar [scrollbar-gutter:stable]">
      <section className="game-dashboard-header flex min-w-0 items-center gap-2">
        <div className="game-section-title flex min-w-0 items-center gap-2">
          <Gamepad2 className="game-section-icon game-section-icon--game h-4 w-4 shrink-0 text-amber-400" />
          <h2 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
            {t("game.title")}
          </h2>
        </div>
      </section>

      <p className="text-xs leading-relaxed text-[var(--color-theme-text-muted)]">
        {t("game.subtitle")}
      </p>

      {hasError ? (
        <div className="flex items-center justify-between gap-2 rounded-[6px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          <span className="truncate">{t("game.error.listFailed")}</span>
          <button
            type="button"
            className="shrink-0 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => void reload()}
          >
            {t("common.refresh")}
          </button>
        </div>
      ) : null}

      <section className="game-dashboard-builtin flex min-w-0 flex-col gap-2">
        <div className="game-section-title flex min-w-0 items-center gap-2">
          <Joystick className="game-section-icon game-section-icon--builtin h-4 w-4 shrink-0 text-emerald-400" />
          <h2 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
            {t("game.builtin.sectionTitle")}
          </h2>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BUILTIN_GAMES.map((meta) => (
            <BuiltinGameCard
              key={meta.id}
              meta={meta}
              bestScore={bestScores[meta.id] ?? 0}
              onPlay={setActiveBuiltinGameId}
            />
          ))}
        </div>
      </section>

      <section className="game-dashboard-imported flex min-w-0 flex-col gap-2">
        <div className="game-section-title flex min-w-0 flex-wrap items-center gap-2">
          <MemoryStick className="game-section-icon game-section-icon--imported h-4 w-4 shrink-0 text-amber-400" />
          <h2 className="truncate text-sm font-semibold text-[var(--color-theme-text)]">
            {t("game.imported.sectionTitle")}
          </h2>

          <LxIconButton
            iconOnly={false}
            size="small"
            icon={<Plus />}
            disabled={isImporting}
            textClass="text-[var(--color-theme-text)]"
            hoverBgClass="hover:bg-[var(--color-theme-surface-hover)]"
            className="ml-auto cursor-pointer rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] hover:border-[var(--color-theme-border-strong)]"
            onClick={() => void handleImport()}
          >
            <span>{isImporting ? t("game.importing") : t("game.import")}</span>
          </LxIconButton>
        </div>

        {entries.length === 0 && !isLoading ? (
          <div className="game-empty-state flex flex-col items-center justify-center gap-2 rounded-[var(--theme-radius-base)] border border-dashed border-[var(--color-theme-border)] py-14 text-center">
            <span className="text-xs text-[var(--color-theme-text-muted)]">
              {t("game.imported.empty")}
            </span>
            <span className="max-w-[420px] text-xs leading-relaxed text-[var(--color-theme-text-subtle)]">
              {t("game.imported.emptyHint")}
            </span>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {entries.map((entry) => (
              <GameCard
                key={entry.id}
                entry={entry}
                onPlay={setActiveEntry}
                onRename={handleRename}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </section>

      <LxLoadingOverlay isLoading={isLoading && entries.length === 0} text={t("game.loading")} />
    </div>
  )
}
