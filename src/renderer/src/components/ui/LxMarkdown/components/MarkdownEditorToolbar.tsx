import { Keyboard, Search, Table2 } from "lucide-react"
import { useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import type { MarkdownTableSize, MarkdownToolbarAction } from "@/components/ui/LxMarkdown/types"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { type TranslationKey, useTranslation } from "@/i18n"
import { isMacOS } from "@/lib/platform"

// 工具栏属性。
interface MarkdownEditorToolbarProps {
  actions: MarkdownToolbarAction[]
  isSaved: boolean
  // 是否显示保存状态圆点；隐藏时同步过滤 Cmd/Ctrl+S 快捷键说明。
  showSaveStatus: boolean
  onInsertTable: (size: MarkdownTableSize) => void
}

const markdownShortcuts: { keys: string; descKey: TranslationKey }[] = [
  { keys: "Cmd / Ctrl + S", descKey: "markdown.shortcutSave" },
  { keys: "Tab", descKey: "markdown.shortcutTab" },
  { keys: "Shift + Tab", descKey: "markdown.shortcutShiftTab" },
  { keys: "Cmd / Ctrl + D", descKey: "markdown.shortcutDeleteLine" },
  { keys: "Cmd / Ctrl + B", descKey: "markdown.shortcutBold" },
  { keys: "Cmd / Ctrl + I", descKey: "markdown.shortcutItalic" },
  { keys: "Cmd / Ctrl + 1 - 6", descKey: "markdown.shortcutHeading" },
  { keys: "Cmd / Ctrl + O", descKey: "markdown.shortcutOrderedList" },
  { keys: "Cmd / Ctrl + L", descKey: "markdown.shortcutLink" },
  { keys: "Cmd / Ctrl + Shift + S", descKey: "markdown.shortcutStrikethrough" },
  { keys: "Cmd / Ctrl + Shift + U", descKey: "markdown.shortcutUnorderedList" },
  { keys: "Cmd / Ctrl + Shift + C", descKey: "markdown.shortcutCodeBlock" },
  { keys: "Cmd / Ctrl + Shift + 8", descKey: "markdown.shortcutOrderedList" },
  { keys: "Cmd / Ctrl + Shift + 9", descKey: "markdown.shortcutUnorderedList" },
  { keys: "Cmd / Ctrl + Z", descKey: "markdown.shortcutUndo" },
  { keys: "Cmd / Ctrl + Shift + Z", descKey: "markdown.shortcutRedo" },
  { keys: "Cmd / Ctrl + Alt + C", descKey: "markdown.shortcutInlineCode" },
  { keys: "Cmd / Ctrl + Shift + Alt + T", descKey: "markdown.shortcutInsertTable" },
  { keys: "Cmd / Ctrl + Shift + F", descKey: "markdown.shortcutFormat" },
  { keys: "Cmd / Ctrl + Shift + E", descKey: "markdown.shortcutSplitView" },
  { keys: "Cmd / Ctrl + Shift + V", descKey: "markdown.shortcutPreviewOnly" },
]

/**
 * 渲染 Markdown 编辑器的格式化工具栏。
 */
export const MarkdownEditorToolbar = ({
  actions,
  isSaved,
  showSaveStatus,
  onInsertTable,
}: MarkdownEditorToolbarProps): React.JSX.Element => {
  const [tableSize, setTableSize] = useState<MarkdownTableSize | null>(null)
  const [shortcutQuery, setShortcutQuery] = useState("")
  const { t } = useTranslation()

  // 隐藏保存状态时移除 Cmd/Ctrl+S 快捷键说明。
  const availableShortcuts = useMemo(
    () =>
      showSaveStatus
        ? markdownShortcuts
        : markdownShortcuts.filter(({ keys }) => keys !== "Cmd / Ctrl + S"),
    [showSaveStatus],
  )

  // 按快捷键或功能说明筛选，便于在完整列表中快速定位。
  const filteredShortcuts = useMemo(() => {
    const query = shortcutQuery.trim().toLocaleLowerCase()
    if (!query) return availableShortcuts

    return availableShortcuts.filter(({ keys, descKey }) =>
      `${keys} ${t(descKey)}`.toLocaleLowerCase().includes(query),
    )
  }, [availableShortcuts, shortcutQuery, t])

  /**
   * 将跨平台快捷键转换为当前系统对应的修饰键显示。
   */
  const getShortcutKeys = (keys: string): string =>
    keys.replace("Cmd / Ctrl", isMacOS() ? "Cmd" : "Ctrl")

  const tablePicker = useMemo(
    () => (
      <div className="flex flex-col gap-1" aria-label={t("markdown.formatTable")}>
        <div className="px-0.5 text-center text-[11px] text-white/70" aria-live="polite">
          {tableSize ? `${tableSize.columns} x ${tableSize.rows}` : t("markdown.formatTable")}
        </div>
        <div className="grid grid-cols-5 gap-1" role="grid">
          {Array.from({ length: 4 }, (_, rowIndex) =>
            Array.from({ length: 5 }, (_, columnIndex) => {
              const columns = columnIndex + 1
              const rows = rowIndex + 1
              const isHighlighted =
                tableSize !== null && columns <= tableSize.columns && rows <= tableSize.rows

              return (
                <button
                  key={`${columns}-${rows}`}
                  aria-label={t("markdown.columnsAndRows", { columns, rows })}
                  className={`h-3.5 w-3.5 rounded-[3px] border transition-colors ${
                    isHighlighted
                      ? "border-[#737373] bg-[#666666]"
                      : "border-[#555555] bg-[#454545] hover:border-[#737373] hover:bg-[#666666]"
                  }`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setTableSize({ columns, rows })}
                  onClick={() => {
                    onInsertTable({ columns, rows })
                    setTableSize(null)
                  }}
                />
              )
            }),
          )}
        </div>
      </div>
    ),
    [onInsertTable, tableSize, t],
  )

  const shortcutList = (
    <div className="flex w-80 flex-col gap-2" aria-label={t("markdown.shortcutsHint")}>
      <LxInput
        aria-label={t("common.search")}
        placeholder={t("common.search")}
        prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
        size="xs"
        value={shortcutQuery}
        onChange={(event) => setShortcutQuery(event.target.value)}
      />
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {filteredShortcuts.map(({ keys, descKey }) => (
            <div
              key={keys}
              className="flex min-h-7 items-center justify-between gap-3 rounded-[3px] px-1.5 text-xs hover:bg-white/5"
            >
              <span className="min-w-0 text-white/55">{t(descKey)}</span>
              <kbd className="shrink-0 font-mono text-[11px] text-white/75">
                {getShortcutKeys(keys)}
              </kbd>
            </div>
          ))}
        </div>
        {filteredShortcuts.length === 0 && (
          <div className="py-4 text-center text-xs text-white/45">{t("common.none")}</div>
        )}
      </div>
    </div>
  )

  const firstRightActionIndex = actions.findIndex(({ alignRight }) => alignRight)
  const leftActions =
    firstRightActionIndex === -1 ? actions : actions.slice(0, firstRightActionIndex)
  const rightActions = firstRightActionIndex === -1 ? [] : actions.slice(firstRightActionIndex)

  return (
    <div className="flex h-9 flex-none items-center gap-0.5 overflow-x-auto border-b border-white/5 px-1.5">
      {leftActions.map(({ disabled, highlighted, icon: Icon, label, onClick }) => (
        <LxIconButton
          key={label}
          aria-label={label}
          disabled={disabled}
          highlighted={highlighted}
          size="small"
          title={{ content: label }}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </LxIconButton>
      ))}
      <LxTooltip
        closeOnContentClick
        content={tablePicker}
        placement="bottom"
        trigger="both"
        contentClassName="!p-1.5"
      >
        <LxIconButton
          aria-label={t("markdown.formatTable")}
          size="small"
          onClick={() => setTableSize(null)}
          onMouseEnter={() => setTableSize(null)}
        >
          <Table2 className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>
      <LxTooltip content={shortcutList} placement="bottom" trigger="click" contentClassName="!p-2">
        <LxIconButton aria-label={t("markdown.shortcutsHint")} size="small">
          <Keyboard className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>

      {rightActions.map(({ disabled, highlighted, icon: Icon, label, onClick }, index) => (
        <LxIconButton
          key={label}
          aria-label={label}
          className={index === 0 ? "ml-auto" : ""}
          disabled={disabled}
          highlighted={highlighted}
          size="small"
          title={{ content: label }}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </LxIconButton>
      ))}

      {showSaveStatus && (
        <LxTooltip content={isSaved ? t("common.saved") : t("common.unsaved")} placement="bottom">
          <span
            aria-label={isSaved ? t("common.saved") : t("common.unsaved")}
            className={`mx-1.5 h-2 w-2 shrink-0 rounded-full ${isSaved ? "bg-emerald-400" : "bg-amber-400"}`}
            role="status"
          />
        </LxTooltip>
      )}
    </div>
  )
}
