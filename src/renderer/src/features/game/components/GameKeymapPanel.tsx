import {
  DEFAULT_GAME_KEYMAP,
  GAME_KEY_ACTIONS,
  GAME_KEY_CODE_TABLE,
  type GameKeyAction,
  type GameKeymap,
  resolveGameKeymap,
} from "@shared/contracts/game"
import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { LxModal } from "@/components/ui/LxModal"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { formatGameKeyLabel, GAME_KEY_ACTION_LABEL_KEYS } from "@/features/game/utils"
import { useTranslation } from "@/i18n"

// 手柄按键展示顺序。
const GAMEPAD_ACTIONS: readonly GameKeyAction[] = [
  "up",
  "down",
  "left",
  "right",
  "a",
  "b",
  "l",
  "r",
  "start",
  "select",
]

// 宿主增强热键展示顺序。
const HOTKEY_ACTIONS: readonly GameKeyAction[] = ["turboA", "turboB", "speed", "pause"]

// 修饰键自身可绑定；带修饰键的组合输入一律拒绝。
const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
])

// 条目基底：与 LxNavItem 叶子行组合；避开 bg-white/5 等工具类，防止像素主题把全部条目渲染成选中态。
const ROW_CLASS = "game-keymap-item border border-white/10 bg-white/[0.04]"
const ROW_ACTIVE_CLASS = "border-[var(--color-theme-accent)] bg-white/[0.08]"
const ROW_CONFLICT_CLASS = "border-red-400/70"
const VALUE_CLASS =
  "game-keymap-value shrink-0 rounded-[4px] border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-xs text-white/90"
const FOOTER_BUTTON_CLASS =
  "cursor-pointer rounded-[var(--theme-radius-base)] border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
const SAVE_BUTTON_CLASS =
  "cursor-pointer rounded-[var(--theme-radius-base)] border border-white/15 bg-white/15 px-3 py-1.5 text-xs font-medium text-white/95 transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"

export interface GameKeymapPanelProps {
  isOpen: boolean
  // 当前游戏的按键覆盖；null 表示全部默认。
  keymap: GameKeymap | null
  isSaving: boolean
  onClose: () => void
  onSave: (keymap: GameKeymap | null) => void
  // 弹窗挂载容器（游戏覆盖层）；缺省挂载到 document.body。
  container?: HTMLElement | null
}

/**
 * 每游戏快捷键面板：分组展示手柄按键与模拟器热键，点击行后按新键完成绑定。
 *
 * 冲突在保存前实时拦截（同一游戏内所有动作共用一个按键命名空间）；保存时只落差异覆盖。
 */
export const GameKeymapPanel = ({
  isOpen,
  keymap,
  isSaving,
  onClose,
  onSave,
  container,
}: GameKeymapPanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<GameKeyAction, string>>(() => resolveGameKeymap(keymap))
  const [capturing, setCapturing] = useState<GameKeyAction | null>(null)
  const [notice, setNotice] = useState<"combo" | "unsupported" | null>(null)

  // 每次打开时以当前生效键位重置草稿。
  useEffect(() => {
    if (!isOpen) return
    setDraft(resolveGameKeymap(keymap))
    setCapturing(null)
    setNotice(null)
  }, [isOpen, keymap])

  // 捕获态在窗口捕获阶段拦截按键：ESC 也作为绑定目标，不冒泡到弹窗关闭逻辑。
  useEffect(() => {
    if (!isOpen || !capturing) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return
      event.preventDefault()
      event.stopPropagation()
      const isModifier = MODIFIER_CODES.has(event.code)
      if (!isModifier && (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
        setNotice("combo")
        return
      }
      if (GAME_KEY_CODE_TABLE[event.code] === undefined) {
        setNotice("unsupported")
        return
      }
      setDraft((current) => ({ ...current, [capturing]: event.code }))
      setCapturing(null)
      setNotice(null)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [capturing, isOpen])

  // 同一游戏内一个按键只能属于一个动作；冲突时禁止保存。
  const conflicts = useMemo((): Map<GameKeyAction, GameKeyAction> => {
    const owners = new Map<string, GameKeyAction[]>()
    for (const action of GAME_KEY_ACTIONS) {
      const code = draft[action]
      owners.set(code, [...(owners.get(code) ?? []), action])
    }
    const result = new Map<GameKeyAction, GameKeyAction>()
    for (const actions of owners.values()) {
      if (actions.length < 2) continue
      for (const action of actions) {
        const other = actions.find((candidate) => candidate !== action)
        if (other) result.set(action, other)
      }
    }
    return result
  }, [draft])

  // 冲突提示取展示顺序中的第一处，避免提示文案抖动。
  const conflictNotice = useMemo((): { action: GameKeyAction; other: GameKeyAction } | null => {
    for (const action of GAME_KEY_ACTIONS) {
      const other = conflicts.get(action)
      if (other) return { action, other }
    }
    return null
  }, [conflicts])

  const canSave = conflicts.size === 0 && capturing === null && !isSaving

  const handleSave = (): void => {
    const overrides: GameKeymap = {}
    for (const action of GAME_KEY_ACTIONS) {
      if (draft[action] !== DEFAULT_GAME_KEYMAP[action]) overrides[action] = draft[action]
    }
    onSave(Object.keys(overrides).length > 0 ? overrides : null)
  }

  const handleReset = (): void => {
    setDraft({ ...DEFAULT_GAME_KEYMAP })
    setCapturing(null)
    setNotice(null)
  }

  const renderRow = (action: GameKeyAction): React.JSX.Element => {
    const isCapturing = capturing === action
    const hasConflict = conflicts.has(action)
    // 状态同时用修饰类暴露给像素主题（捕获态高亮 / 冲突态红石描边）。
    const rowClass = `${ROW_CLASS} ${
      isCapturing ? `game-keymap-item--capturing ${ROW_ACTIVE_CLASS}` : ""
    } ${hasConflict ? `game-keymap-item--conflict ${ROW_CONFLICT_CLASS}` : ""}`

    return (
      <LxNavItem
        key={action}
        size="small"
        level={3}
        aria-label={t(GAME_KEY_ACTION_LABEL_KEYS[action])}
        className={rowClass}
        onClick={() => {
          setCapturing(action)
          setNotice(null)
        }}
      >
        <span
          className={`min-w-0 flex-1 truncate ${hasConflict ? "text-red-300" : "text-white/85"}`}
        >
          {t(GAME_KEY_ACTION_LABEL_KEYS[action])}
        </span>
        <span className={VALUE_CLASS}>
          {isCapturing ? t("game.keymap.pressKey") : formatGameKeyLabel(draft[action], t)}
        </span>
      </LxNavItem>
    )
  }

  return (
    <LxModal
      isOpen={isOpen}
      title={t("game.keymap.title")}
      width={640}
      container={container}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3 text-xs">
        <p className="text-white/55">{t("game.keymap.hint")}</p>

        <div className="grid grid-cols-2 items-start gap-x-4 gap-y-1">
          <span className="text-white/45">{t("game.keymap.gamepadSection")}</span>
          <span className="text-white/45">{t("game.keymap.hotkeysSection")}</span>
          <div className="flex flex-col gap-1">{GAMEPAD_ACTIONS.map(renderRow)}</div>
          <div className="flex flex-col gap-1">{HOTKEY_ACTIONS.map(renderRow)}</div>
        </div>

        {conflictNotice ? (
          <p className="text-red-400">
            {t("game.keymap.conflict", {
              key: formatGameKeyLabel(draft[conflictNotice.action], t),
              action: t(GAME_KEY_ACTION_LABEL_KEYS[conflictNotice.other]),
            })}
          </p>
        ) : null}
        {notice === "combo" ? (
          <p className="text-amber-300">{t("game.keymap.comboUnsupported")}</p>
        ) : null}
        {notice === "unsupported" ? (
          <p className="text-amber-300">{t("game.keymap.keyUnsupported")}</p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" className={`${FOOTER_BUTTON_CLASS} mr-auto`} onClick={handleReset}>
            {t("game.keymap.reset")}
          </button>
          <button type="button" className={FOOTER_BUTTON_CLASS} onClick={onClose}>
            {t("game.keymap.cancel")}
          </button>
          <button
            type="button"
            className={SAVE_BUTTON_CLASS}
            disabled={!canSave}
            onClick={handleSave}
          >
            {t("game.keymap.save")}
          </button>
        </div>
      </div>
    </LxModal>
  )
}
