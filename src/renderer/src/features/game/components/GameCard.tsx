import type { GameRomEntry } from "@shared/contracts/game"
import { Check, Ellipsis, Pencil, Trash2 } from "lucide-react"
import type React from "react"
import { useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenu } from "@/components/ui/LxMenu"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { LxModal } from "@/components/ui/LxModal"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { GbaIcon } from "@/features/game/components/GbaIcon"
import { formatPlayedAt, formatRomSize } from "@/features/game/utils"
import { useTranslation } from "@/i18n"

export interface GameCardProps {
  entry: GameRomEntry
  onPlay: (entry: GameRomEntry) => void
  // 返回是否成功（失败时保持重命名弹窗打开）。
  onRename: (entry: GameRomEntry, title: string) => Promise<boolean>
  onRemove: (entry: GameRomEntry) => Promise<void>
}

/**
 * 单个游戏卡片：展示标题 / 体积 / 最近游玩，右键菜单承载重命名与删除（删除需二次确认）。
 */
export const GameCard = ({
  entry,
  onPlay,
  onRename,
  onRemove,
}: GameCardProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 })
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState(entry.title)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpenMenu = (): void => {
    const rect = menuButtonRef.current?.getBoundingClientRect()
    if (rect) setMenuPosition({ x: rect.left, y: rect.bottom + 6 })
    setIsMenuOpen(true)
  }

  const handleRenameSubmit = async (): Promise<void> => {
    const title = renameDraft.trim()
    if (!title || isSubmitting) return
    setIsSubmitting(true)
    try {
      const isSucceeded = await onRename(entry, title)
      if (isSucceeded) setIsRenameOpen(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveConfirm = async (): Promise<void> => {
    setIsConfirmingRemove(false)
    await onRemove(entry)
  }

  const playedLabel = entry.lastPlayedAt
    ? t("game.card.lastPlayed", { time: formatPlayedAt(entry.lastPlayedAt, locale) })
    : t("game.card.neverPlayed")

  return (
    <>
      <div className="game-card flex min-w-0 flex-col gap-2 rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-4 transition-colors hover:border-[var(--color-theme-border-strong)] hover:bg-[var(--color-theme-surface-hover)]">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <GbaIcon className="game-card-icon game-card-icon--imported h-5 w-5 shrink-0 text-amber-400" />
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            <LxTag size="small">{t("game.imported.tag")}</LxTag>
            <LxTooltip
              closeOnOutsideClick
              content={
                isConfirmingRemove
                  ? t("game.remove.description", { title: entry.title })
                  : t("game.card.more")
              }
              open={isConfirmingRemove ? true : undefined}
              placement="top"
              title={isConfirmingRemove ? t("game.remove.title") : undefined}
              onCancel={() => setIsConfirmingRemove(false)}
              onConfirm={isConfirmingRemove ? () => void handleRemoveConfirm() : undefined}
            >
              <LxIconButton
                ref={menuButtonRef}
                icon={<Ellipsis />}
                size="small"
                aria-label={t("game.card.more")}
                className="cursor-pointer rounded-[6px] border border-[var(--color-theme-border)] hover:border-[var(--color-theme-border-strong)]"
                onClick={handleOpenMenu}
              />
            </LxTooltip>
          </div>
        </div>

        <button
          type="button"
          data-variant="ghost"
          className="flex min-w-0 cursor-pointer flex-col gap-1 text-left"
          onClick={() => onPlay(entry)}
        >
          <span className="text-sm font-semibold break-words text-[var(--color-theme-text)]">
            {entry.title}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-mono text-xs text-[var(--color-theme-text-muted)]">
              {formatRomSize(entry.romSize)}
            </span>
            <span className="text-xs leading-relaxed text-[var(--color-theme-text-subtle)]">
              {playedLabel}
            </span>
          </span>
        </button>
      </div>

      <LxMenu
        isOpen={isMenuOpen}
        x={menuPosition.x}
        y={menuPosition.y}
        ariaLabel={t("game.card.more")}
        anchor={menuButtonRef.current}
        onClose={() => setIsMenuOpen(false)}
      >
        <LxMenuItem
          leading={<Pencil />}
          onClick={() => {
            setIsMenuOpen(false)
            setRenameDraft(entry.title)
            setIsRenameOpen(true)
          }}
        >
          {t("game.card.rename")}
        </LxMenuItem>
        <LxMenuItem
          danger
          leading={<Trash2 />}
          onClick={() => {
            setIsMenuOpen(false)
            setIsConfirmingRemove(true)
          }}
        >
          {t("game.card.remove")}
        </LxMenuItem>
      </LxMenu>

      <LxModal
        isOpen={isRenameOpen}
        title={t("game.rename.title")}
        width={360}
        onClose={() => setIsRenameOpen(false)}
      >
        <div className="flex flex-col gap-3 p-1">
          <LxInput
            autoFocus
            value={renameDraft}
            placeholder={t("game.rename.placeholder")}
            onChange={(event) => setRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleRenameSubmit()
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <LxIconButton
              iconOnly={false}
              size="small"
              textClass="text-[var(--color-theme-text-muted)]"
              hoverBgClass="hover:bg-[var(--color-theme-surface-hover)]"
              className="cursor-pointer rounded-[6px] border border-[var(--color-theme-border)]"
              onClick={() => setIsRenameOpen(false)}
            >
              <span>{t("game.rename.cancel")}</span>
            </LxIconButton>
            <LxIconButton
              iconOnly={false}
              size="small"
              icon={<Check />}
              disabled={isSubmitting || !renameDraft.trim()}
              textClass="text-[var(--color-theme-text)]"
              hoverBgClass="hover:bg-[var(--color-theme-surface-hover)]"
              className="cursor-pointer rounded-[6px] border border-[var(--color-theme-border-strong)] bg-[var(--color-theme-surface)] font-medium"
              onClick={() => void handleRenameSubmit()}
            >
              <span>{t("game.rename.confirm")}</span>
            </LxIconButton>
          </div>
        </div>
      </LxModal>
    </>
  )
}
