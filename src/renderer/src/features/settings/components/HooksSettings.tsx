import { HOOK_EVENT_NAMES, type HookEventName, isHookMatcherEvent } from "@shared/contracts/agent"
import type { HookCommandEntry, HookMatcherGroup, HookSettings } from "@shared/settings"
import { AlertTriangle, ArrowDown, ArrowUp, Edit2, Loader2, Plus, Trash2 } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxModal } from "@/components/ui/LxModal"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { useRegisterSettingsSection } from "../hooks/settingsDraftStore"
import { useHookSettings } from "../hooks/useHookSettings"
import { notifySettingsChanged } from "../settingsChangeNotifier"

interface HookRow {
  event: HookEventName
  index: number
  group: HookMatcherGroup
  entry: HookCommandEntry
}

// 解析 matcher 输入：空 = 全部；null = 非法（含空段）。
const parseMatcherInput = (raw: string): string | undefined | null => {
  const text = raw.trim()
  if (!text) return undefined
  const names = text.split("|").map((name) => name.trim())
  if (names.some((name) => !name)) return null
  return names.join("|")
}

export const HooksSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const { hooks, setHooks, isLoading, loadFailed, isDirty, save, reset } = useHookSettings()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<{ event: HookEventName; index: number } | null>(null)
  const [formEvent, setFormEvent] = useState<HookEventName>("PreToolUse")
  const [formName, setFormName] = useState("")
  const [formMatcher, setFormMatcher] = useState("")
  const [formCommand, setFormCommand] = useState("")
  const [formCommandWindows, setFormCommandWindows] = useState("")
  const [formTimeout, setFormTimeout] = useState("")
  const [formError, setFormError] = useState("")
  const [preserved, setPreserved] = useState<
    Pick<HookCommandEntry, "type" | "additionalContextLimit">
  >({})

  const eventOptions = useMemo(
    () => HOOK_EVENT_NAMES.map((event) => ({ value: event, label: event })),
    [],
  )

  const groupedRows = useMemo((): { event: HookEventName; rows: HookRow[] }[] => {
    const result: { event: HookEventName; rows: HookRow[] }[] = []
    for (const event of HOOK_EVENT_NAMES) {
      const eventGroups = hooks[event]
      if (!eventGroups || eventGroups.length === 0) continue
      result.push({
        event,
        rows: eventGroups.map((group, index) => ({ event, index, group, entry: group.hooks[0]! })),
      })
    }
    return result
  }, [hooks])

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      await save()
      notifySettingsChanged("hooks")
    } catch (err) {
      console.error("[HooksSettings] Failed to save settings:", err)
      toast.error(t("settings.saveFailed"))
      throw err
    }
  }, [save, t, toast])

  useRegisterSettingsSection({
    section: "hooks",
    isDirty,
    onSave: handleSave,
    onReset: reset,
  })

  const handleOpenAdd = (): void => {
    setEditing(null)
    setFormEvent("PreToolUse")
    setFormName(`${"PreToolUse"}-${(hooks.PreToolUse?.length ?? 0) + 1}`)
    setFormMatcher("")
    setFormCommand("")
    setFormCommandWindows("")
    setFormTimeout("")
    setFormError("")
    setPreserved({})
    setModalOpen(true)
  }

  const handleOpenEdit = (row: HookRow): void => {
    setEditing({ event: row.event, index: row.index })
    setFormEvent(row.event)
    setFormName(row.entry.name)
    setFormMatcher(row.group.matcher ?? "")
    setFormCommand(row.entry.command)
    setFormCommandWindows(row.entry.commandWindows ?? "")
    setFormTimeout(row.entry.timeout !== undefined ? String(row.entry.timeout) : "")
    setFormError("")
    setPreserved({
      ...(row.entry.type ? { type: row.entry.type } : {}),
      ...(row.entry.additionalContextLimit !== undefined
        ? { additionalContextLimit: row.entry.additionalContextLimit }
        : {}),
    })
    setModalOpen(true)
  }

  const handleMove = (event: HookEventName, index: number, delta: -1 | 1): void => {
    const groups = [...(hooks[event] ?? [])]
    const target = index + delta
    if (target < 0 || target >= groups.length) return
    const current = groups[index]!
    groups[index] = groups[target]!
    groups[target] = current
    setHooks({ ...hooks, [event]: groups })
  }

  const handleDelete = (event: HookEventName, index: number): void => {
    const groups = (hooks[event] ?? []).filter((_, rowIndex) => rowIndex !== index)
    const next: HookSettings = { ...hooks }
    if (groups.length > 0) next[event] = groups
    else delete next[event]
    setHooks(next)
  }

  const handleSaveModal = (): void => {
    const name = formName.trim()
    const command = formCommand.trim()
    if (!name) {
      setFormError(t("settings.hooksNameRequired"))
      return
    }
    if (!command) {
      setFormError(t("settings.hooksCommandRequired"))
      return
    }

    let timeout: number | undefined
    const timeoutText = formTimeout.trim()
    if (timeoutText) {
      const parsed = Number(timeoutText)
      if (!Number.isInteger(parsed) || parsed < 1) {
        setFormError(t("settings.hooksTimeoutInvalid"))
        return
      }
      timeout = parsed
    }

    let matcher: string | undefined
    if (isHookMatcherEvent(formEvent)) {
      const parsed = parseMatcherInput(formMatcher)
      if (parsed === null) {
        setFormError(t("settings.hooksMatcherInvalid"))
        return
      }
      matcher = parsed
    }

    const entry: HookCommandEntry = {
      name,
      command,
      ...(formCommandWindows.trim() ? { commandWindows: formCommandWindows.trim() } : {}),
      ...(timeout !== undefined ? { timeout } : {}),
      ...preserved,
    }
    const nextGroup: HookMatcherGroup = { ...(matcher ? { matcher } : {}), hooks: [entry] }

    const next: HookSettings = { ...hooks }
    if (editing) {
      const oldGroups = (next[editing.event] ?? []).filter((_, index) => index !== editing.index)
      if (formEvent === editing.event) {
        oldGroups.splice(editing.index, 0, nextGroup)
      }
      if (oldGroups.length > 0) next[editing.event] = oldGroups
      else delete next[editing.event]
      if (formEvent !== editing.event) {
        next[formEvent] = [...(next[formEvent] ?? []), nextGroup]
      }
    } else {
      next[formEvent] = [...(next[formEvent] ?? []), nextGroup]
    }

    setHooks(next)
    setModalOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>{t("settings.loadingSettings")}</span>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      {loadFailed ? (
        <div className="flex items-center gap-1.5 rounded-[4px] bg-red-500/15 p-2 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{t("settings.loadSettingsFailed")}</span>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center justify-between gap-3">
        <span className="text-xs text-[var(--color-theme-text-muted,rgba(255,255,255,0.45))]">
          {t("settings.hooksEffective")}
        </span>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="flex shrink-0 items-center gap-1 rounded-[6px] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.15))] bg-[var(--color-theme-surface,rgba(255,255,255,0.04))] px-2.5 py-1.5 text-xs text-[var(--color-theme-text,rgba(255,255,255,0.8))] transition-colors hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.08))] cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{t("settings.hooksAdd")}</span>
        </button>
      </div>

      {groupedRows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
          {t("settings.hooksEmpty")}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groupedRows.map(({ event, rows }) => (
            <div key={event} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.85))]">
                  {event}
                </span>
                <span className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))]">
                  {rows.length}
                </span>
              </div>

              {rows.map((row) => (
                <div
                  key={`${event}-${row.index}`}
                  className="flex flex-col gap-1.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,rgba(255,255,255,0.02))] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-xs font-semibold text-[var(--color-theme-text,rgba(255,255,255,0.9))]">
                        {row.entry.name}
                      </span>
                      {row.group.matcher ? (
                        <LxTag size="small" color="sky">
                          {row.group.matcher}
                        </LxTag>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <LxIconButton
                        preset="default"
                        size="small"
                        disabled={row.index === 0}
                        onClick={() => handleMove(event, row.index, -1)}
                        title={{ content: t("settings.hooksMoveUp"), placement: "top" }}
                        aria-label={t("settings.hooksMoveUp")}
                      >
                        <ArrowUp className="h-3.5 w-3.5 text-white/70" />
                      </LxIconButton>
                      <LxIconButton
                        preset="default"
                        size="small"
                        disabled={row.index === rows.length - 1}
                        onClick={() => handleMove(event, row.index, 1)}
                        title={{ content: t("settings.hooksMoveDown"), placement: "top" }}
                        aria-label={t("settings.hooksMoveDown")}
                      >
                        <ArrowDown className="h-3.5 w-3.5 text-white/70" />
                      </LxIconButton>
                      <LxIconButton
                        preset="default"
                        size="small"
                        onClick={() => handleOpenEdit(row)}
                        title={{ content: t("settings.edit"), placement: "top" }}
                        aria-label={t("settings.edit")}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-white/70" />
                      </LxIconButton>
                      <LxIconButton
                        preset="default"
                        size="small"
                        onClick={() => handleDelete(event, row.index)}
                        title={{ content: t("settings.delete"), placement: "top" }}
                        aria-label={t("settings.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400/80 hover:text-red-400" />
                      </LxIconButton>
                    </div>
                  </div>

                  <code className="overflow-x-auto rounded bg-black/30 px-1.5 py-1 font-mono text-[11px] text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
                    {row.entry.command}
                  </code>

                  {row.entry.timeout !== undefined ? (
                    <span className="text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]">
                      {t("settings.hooksTimeout")}: {row.entry.timeout}s
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <LxModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("settings.hooksEditTitle") : t("settings.hooksAddTitle")}
        width="520px"
      >
        <div className="flex flex-col gap-3.5 p-1 text-xs text-white/80">
          {formError ? (
            <div className="flex items-center gap-1.5 rounded-[4px] bg-red-500/15 p-2 text-xs text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.hooksEvent")}</span>
            <LxSelect
              size="small"
              value={formEvent}
              onChange={(value) => {
                setFormEvent(value)
                setFormError("")
              }}
              options={eventOptions}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.hooksName")} *</span>
            <LxInput
              size="sm"
              placeholder={t("settings.hooksNamePlaceholder")}
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value)
                setFormError("")
              }}
            />
          </div>

          {isHookMatcherEvent(formEvent) ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-white/70">{t("settings.hooksMatcher")}</span>
              <LxInput
                size="sm"
                placeholder={t("settings.hooksMatcherPlaceholder")}
                value={formMatcher}
                onChange={(e) => {
                  setFormMatcher(e.target.value)
                  setFormError("")
                }}
              />
              <span className="text-[11px] text-white/40">{t("settings.hooksMatcherHint")}</span>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.hooksCommand")} *</span>
            <LxInput
              size="sm"
              multiline
              placeholder={t("settings.hooksCommandPlaceholder")}
              value={formCommand}
              onChange={(e) => {
                setFormCommand(e.target.value)
                setFormError("")
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.hooksCommandWindows")}</span>
            <LxInput
              size="sm"
              multiline
              placeholder={t("settings.hooksCommandWindowsPlaceholder")}
              value={formCommandWindows}
              onChange={(e) => setFormCommandWindows(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.hooksTimeout")}</span>
            <LxInput
              size="sm"
              placeholder={t("settings.hooksTimeoutPlaceholder")}
              value={formTimeout}
              onChange={(e) => {
                setFormTimeout(e.target.value)
                setFormError("")
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-[6px] border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
            >
              {t("settings.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSaveModal}
              className="rounded-[6px] border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              {t("settings.confirm")}
            </button>
          </div>
        </div>
      </LxModal>
    </div>
  )
}
