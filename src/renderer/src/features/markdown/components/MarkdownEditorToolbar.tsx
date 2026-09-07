import { ChevronLeft, ChevronRight, Keyboard, Plus, Search, Table2, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { getMarkdownTemplateStatuses } from "@/features/markdown/commands/markdownBlockCommands"
import type {
  MarkdownPage,
  MarkdownTableSize,
  MarkdownToolbarAction,
} from "@/features/markdown/types"
import { type TranslationKey, useTranslation } from "@/i18n"
import { isMacOS } from "@/lib/platform"

// 工具栏属性。
interface MarkdownEditorToolbarProps {
  actions: MarkdownToolbarAction[]
  isSaved: boolean
  onInsertTable: (size: MarkdownTableSize) => void
  pageMode?: boolean
  pages?: MarkdownPage[]
  activePageIndex?: number
  pageName?: string
  onPageChange?: (index: number) => void
  onPageNameChange?: (name: string) => void
  onCreatePage?: () => void
  onDeletePage?: () => void
  onPageReorder?: (fromIndex: number, toIndex: number) => void
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
  { keys: "Cmd / Ctrl + Alt + K", descKey: "markdown.shortcutCodeBlock" },
  { keys: "Cmd / Ctrl + Shift + 8", descKey: "markdown.shortcutOrderedList" },
  { keys: "Cmd / Ctrl + Shift + 9", descKey: "markdown.shortcutUnorderedList" },
  { keys: "Cmd / Ctrl + Z", descKey: "markdown.shortcutUndo" },
  { keys: "Cmd / Ctrl + Shift + Z", descKey: "markdown.shortcutRedo" },
  { keys: "Cmd / Ctrl + Alt + C", descKey: "markdown.shortcutInlineCode" },
  { keys: "Cmd / Ctrl + Shift + C", descKey: "markdown.shortcutCopyTemplateBlock" },
  { keys: "Cmd / Ctrl + Shift + Alt + T", descKey: "markdown.shortcutInsertTable" },
  { keys: "Cmd / Ctrl + Shift + F", descKey: "markdown.shortcutFormat" },
  { keys: "Cmd / Ctrl + Shift + E", descKey: "markdown.shortcutSplitView" },
  { keys: "Cmd / Ctrl + Shift + V", descKey: "markdown.shortcutPreviewOnly" },
]

// 分页模式专属快捷键。
const pageShortcuts: { keys: string; descKey: TranslationKey }[] = [
  { keys: "Cmd / Ctrl + Alt + ← / →", descKey: "markdown.shortcutPageSwitch" },
]

/**
 * 渲染 Markdown 编辑器的格式化工具栏。
 */
export const MarkdownEditorToolbar = ({
  actions,
  isSaved,
  onInsertTable,
  pageMode = false,
  pages = [],
  activePageIndex = 0,
  pageName = "",
  onPageChange,
  onPageNameChange,
  onCreatePage,
  onDeletePage,
  onPageReorder,
}: MarkdownEditorToolbarProps): React.JSX.Element => {
  const [tableSize, setTableSize] = useState<MarkdownTableSize | null>(null)
  const [shortcutQuery, setShortcutQuery] = useState("")
  const [isEditingPageName, setIsEditingPageName] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const [isPageListOpen, setIsPageListOpen] = useState(false)
  const [pageListQuery, setPageListQuery] = useState("")
  // 页面列表拖拽排序：记录被拖拽页面的 id。
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null)
  const draggingPageIdRef = useRef<string | null>(null)
  const pageNameBeforeEditRef = useRef(pageName)
  const { t } = useTranslation()

  // Auto-focus and edit page name when a new page is created
  const prevPagesLengthRef = useRef(pages.length)
  useEffect(() => {
    if (pages.length > prevPagesLengthRef.current) {
      setIsEditingPageName(true)
    }
    prevPagesLengthRef.current = pages.length
  }, [pages.length])

  // 按快捷键或功能说明筛选，便于在完整列表中快速定位。
  const filteredShortcuts = useMemo(() => {
    const shortcuts = pageMode ? [...markdownShortcuts, ...pageShortcuts] : markdownShortcuts
    const query = shortcutQuery.trim().toLocaleLowerCase()
    if (!query) return shortcuts

    return shortcuts.filter(({ keys, descKey }) =>
      `${keys} ${t(descKey)}`.toLocaleLowerCase().includes(query),
    )
  }, [pageMode, shortcutQuery, t])

  /**
   * 将跨平台快捷键转换为当前系统对应的修饰键显示。
   */
  const getShortcutKeys = (keys: string): string =>
    keys.replace("Cmd / Ctrl", isMacOS() ? "Cmd" : "Ctrl")

  // 每个页面的模板块状态数量，用于页面列表右侧标签展示。
  const pageTemplateCounts = useMemo(() => {
    const countsByPage = new Map<string, { todo: number; inProgress: number; done: number }>()
    for (const page of pages) {
      const counts = { todo: 0, inProgress: 0, done: 0 }
      for (const status of getMarkdownTemplateStatuses(page.content)) {
        if (status === "todo") counts.todo += 1
        else if (status === "in_progress") counts.inProgress += 1
        else counts.done += 1
      }
      countsByPage.set(page.id, counts)
    }
    return countsByPage
  }, [pages])

  // 按页面名称筛选，便于在完整列表中快速定位。
  const filteredPages = useMemo(() => {
    const query = pageListQuery.trim().toLocaleLowerCase()
    if (!query) return pages
    return pages.filter(({ name }) => name.toLocaleLowerCase().includes(query))
  }, [pageListQuery, pages])

  /**
   * 第一次点击进入确认态，第二次点击才真正删除页面。
   */
  const handleDeletePageClick = (): void => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }
    setIsConfirmingDelete(false)
    setIsPageListOpen(false)
    setPageListQuery("")
    onDeletePage?.()
  }

  /**
   * 拖拽放到目标页面上时，按真实索引触发页面排序。
   */
  const handlePageDropOn = (targetId: string): void => {
    const fromId = draggingPageIdRef.current
    draggingPageIdRef.current = null
    setDraggingPageId(null)
    if (!fromId || fromId === targetId) return
    const fromIndex = pages.findIndex((page) => page.id === fromId)
    const toIndex = pages.findIndex((page) => page.id === targetId)
    if (fromIndex < 0 || toIndex < 0) return
    onPageReorder?.(fromIndex, toIndex)
  }

  const pageList = (
    <div className="flex w-60 flex-col gap-2" aria-label={t("markdown.pageList")}>
      <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5">
        <button
          type="button"
          disabled={pages.length === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-1 text-xs text-white/70 hover:bg-white/8 hover:text-white disabled:opacity-35"
          onClick={() => {
            setIsPageListOpen(false)
            setPageListQuery("")
            setIsConfirmingDelete(false)
            onCreatePage?.()
          }}
        >
          <Plus className="h-3.5 w-3.5 text-white/45" />
          <span>{t("common.add")}</span>
        </button>

        <button
          type="button"
          disabled={pages.length <= 1}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-1 text-xs transition-colors disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-rose-400/80 ${
            isConfirmingDelete
              ? "bg-rose-600 text-white hover:bg-rose-500"
              : "text-rose-400/80 hover:bg-rose-400/10 hover:text-rose-300"
          }`}
          onClick={handleDeletePageClick}
        >
          <Trash2
            className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
          />
          <span>{isConfirmingDelete ? t("common.confirmDelete") : t("common.delete")}</span>
        </button>
      </div>

      <LxInput
        aria-label={t("common.search")}
        placeholder={t("common.search")}
        prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
        size="xs"
        value={pageListQuery}
        onChange={(event) => setPageListQuery(event.target.value)}
      />
      <div className="max-h-60 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {filteredPages.map((page) => {
            const pageIndex = pages.findIndex((entry) => entry.id === page.id)
            const isCurrent = pageIndex === activePageIndex
            const counts = pageTemplateCounts.get(page.id)
            const hasCounts =
              counts && (counts.todo > 0 || counts.inProgress > 0 || counts.done > 0)
            const isDragging = draggingPageId === page.id
            return (
              <button
                key={page.id}
                disabled={isCurrent}
                draggable
                type="button"
                onDragStart={(event) => {
                  draggingPageIdRef.current = page.id
                  setDraggingPageId(page.id)
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", page.id)
                }}
                onDragEnd={() => {
                  draggingPageIdRef.current = null
                  setDraggingPageId(null)
                }}
                onDragOver={(event) => {
                  if (draggingPageIdRef.current !== null && draggingPageIdRef.current !== page.id) {
                    event.preventDefault()
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  handlePageDropOn(page.id)
                }}
                className={`flex min-h-7 w-full items-center gap-2 rounded-[3px] px-1.5 text-left text-xs ${
                  isDragging ? "opacity-40" : ""
                } ${
                  isCurrent
                    ? "cursor-default bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5"
                }`}
                onClick={() => {
                  setIsPageListOpen(false)
                  setPageListQuery("")
                  setIsConfirmingDelete(false)
                  onPageChange?.(pageIndex)
                }}
              >
                <span className="min-w-0 truncate">{page.name}</span>
                {hasCounts && (
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {counts.todo > 0 && (
                      <LxTooltip
                        content={t("markdown.todoCountLabel", { count: counts.todo })}
                        placement="top"
                      >
                        <span
                          aria-label={t("markdown.todoCountLabel", { count: counts.todo })}
                          className="flex items-center gap-1 rounded-[4px] bg-white/5 px-1 text-[10px] leading-4 text-white/50"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                          {counts.todo}
                        </span>
                      </LxTooltip>
                    )}
                    {counts.inProgress > 0 && (
                      <LxTooltip
                        content={t("markdown.inProgressCountLabel", { count: counts.inProgress })}
                        placement="top"
                      >
                        <span
                          aria-label={t("markdown.inProgressCountLabel", {
                            count: counts.inProgress,
                          })}
                          className="flex items-center gap-1 rounded-[4px] bg-amber-400/10 px-1 text-[10px] leading-4 text-amber-400"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                          {counts.inProgress}
                        </span>
                      </LxTooltip>
                    )}
                    {counts.done > 0 && (
                      <LxTooltip
                        content={t("markdown.completedCountLabel", { count: counts.done })}
                        placement="top"
                      >
                        <span
                          aria-label={t("markdown.completedCountLabel", { count: counts.done })}
                          className="flex items-center gap-1 rounded-[4px] bg-emerald-400/10 px-1 text-[10px] leading-4 text-emerald-400"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {counts.done}
                        </span>
                      </LxTooltip>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {filteredPages.length === 0 && (
          <div className="py-4 text-center text-xs text-white/45">{t("common.none")}</div>
        )}
      </div>
    </div>
  )

  const pageNameControls = pageMode && pages.length > 0 && (
    <div className="flex shrink-0 items-center">
      {isEditingPageName ? (
        <input
          autoFocus
          aria-label={t("common.name")}
          className="w-[12ch] border-b border-white/20 bg-transparent px-1 text-left text-xs text-white/80 outline-none"
          value={pageName}
          onBlur={() => {
            if (!pageName.trim()) onPageNameChange?.(pageNameBeforeEditRef.current)
            setIsEditingPageName(false)
          }}
          onChange={(event) => onPageNameChange?.(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Escape") {
              onPageNameChange?.(pageNameBeforeEditRef.current)
              setIsEditingPageName(false)
              return
            }
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              if (!pageName.trim()) onPageNameChange?.(pageNameBeforeEditRef.current)
              setIsEditingPageName(false)
            }
          }}
        />
      ) : (
        <LxTooltip
          content={pageList}
          contentClassName="!p-2"
          onOpenChange={(isOpen) => {
            setIsPageListOpen(isOpen)
            if (!isOpen) {
              setPageListQuery("")
              setIsConfirmingDelete(false)
            }
          }}
          open={isPageListOpen}
          placement="bottom"
          trigger="hover"
        >
          <button
            type="button"
            aria-label={`${t("common.edit")} ${pageName}`}
            className="min-w-[4ch] max-w-[12ch] truncate px-1 text-center text-xs text-white/65 hover:text-white/90"
            onClick={() => {
              pageNameBeforeEditRef.current = pageName
              setIsEditingPageName(true)
            }}
          >
            {pageName}
          </button>
        </LxTooltip>
      )}
    </div>
  )

  const pageSwitchControls = pageMode && pages.length > 0 && (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <LxIconButton
        aria-label={t("markdown.previousPage")}
        disabled={activePageIndex === 0}
        size="small"
        title={{ content: t("markdown.previousPage") }}
        onClick={() => onPageChange?.(activePageIndex - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </LxIconButton>
      <span
        aria-label={t("markdown.pageIndicator", {
          current: activePageIndex + 1,
          total: pages.length,
        })}
        className="h-7 px-1.5 text-[11px] leading-7 tabular-nums text-white/45"
      >
        {activePageIndex + 1} / {pages.length}
      </span>
      <LxIconButton
        aria-label={t("markdown.nextPage")}
        disabled={activePageIndex === pages.length - 1}
        size="small"
        title={{ content: t("markdown.nextPage") }}
        onClick={() => onPageChange?.(activePageIndex + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </LxIconButton>
    </div>
  )

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
      {pageNameControls}
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
      <LxTooltip
        hover={{
          content: t("markdown.shortcutsHint"),
          placement: "bottom",
        }}
        click={{
          content: shortcutList,
          placement: "bottom",
          contentClassName: "!p-2",
        }}
      >
        <LxIconButton aria-label={t("markdown.shortcutsHint")} size="small">
          <Keyboard className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>

      {pageSwitchControls}

      {rightActions.map(({ disabled, highlighted, icon: Icon, label, onClick }, index) => (
        <LxIconButton
          key={label}
          aria-label={label}
          className={index === 0 && !pageSwitchControls ? "ml-auto" : ""}
          disabled={disabled}
          highlighted={highlighted}
          size="small"
          title={{ content: label }}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </LxIconButton>
      ))}

      <LxTooltip content={isSaved ? t("common.saved") : t("common.unsaved")} placement="bottom">
        <span
          aria-label={isSaved ? t("common.saved") : t("common.unsaved")}
          className={`mx-1.5 h-2 w-2 shrink-0 rounded-full ${isSaved ? "bg-emerald-400" : "bg-amber-400"}`}
          role="status"
        />
      </LxTooltip>
    </div>
  )
}
