import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Keyboard,
  MoreVertical,
  Plus,
  Search,
  Table2,
  Trash2,
} from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import type {
  MarkdownPage,
  MarkdownTableSize,
  MarkdownToolbarAction,
} from "@/components/ui/LxMarkdown/types"
import { LxMenuItem } from "@/components/ui/LxMenu"
import { LxTooltip } from "@/components/ui/LxTooltip"
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
}

const markdownShortcuts = [
  { keys: "Cmd / Ctrl + S", description: "保存当前内容" },
  { keys: "Tab", description: "增加缩进" },
  { keys: "Shift + Tab", description: "减少缩进" },
  { keys: "Cmd / Ctrl + D", description: "删除当前行" },
  { keys: "Cmd / Ctrl + B", description: "粗体" },
  { keys: "Cmd / Ctrl + I", description: "斜体" },
  { keys: "Cmd / Ctrl + 1 - 6", description: "标题" },
  { keys: "Cmd / Ctrl + O", description: "有序列表" },
  { keys: "Cmd / Ctrl + L", description: "链接" },
  { keys: "Cmd / Ctrl + Shift + S", description: "删除线" },
  { keys: "Cmd / Ctrl + Shift + U", description: "无序列表" },
  { keys: "Cmd / Ctrl + Shift + C", description: "代码块" },
  { keys: "Cmd / Ctrl + Shift + 8", description: "有序列表" },
  { keys: "Cmd / Ctrl + Shift + 9", description: "无序列表" },
  { keys: "Cmd / Ctrl + Z", description: "撤销" },
  { keys: "Cmd / Ctrl + Shift + Z", description: "重做" },
  { keys: "Cmd / Ctrl + Alt + C", description: "行内代码" },
  { keys: "Cmd / Ctrl + Shift + Alt + T", description: "插入表格" },
  { keys: "Cmd / Ctrl + Shift + F", description: "格式化 Markdown" },
  { keys: "Cmd / Ctrl + Shift + E", description: "双栏预览" },
  { keys: "Cmd / Ctrl + Shift + V", description: "仅预览" },
]

// 分页模式专属快捷键。
const pageShortcuts = [{ keys: "Cmd / Ctrl + Alt + ← / →", description: "切换上一页 / 下一页" }]

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
}: MarkdownEditorToolbarProps): React.JSX.Element => {
  const [tableSize, setTableSize] = useState<MarkdownTableSize | null>(null)
  const [shortcutQuery, setShortcutQuery] = useState("")
  const [isEditingPageName, setIsEditingPageName] = useState(false)
  const [isPageMenuOpen, setIsPageMenuOpen] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const pageNameBeforeEditRef = useRef(pageName)

  // 按快捷键或功能说明筛选，便于在完整列表中快速定位。
  const filteredShortcuts = useMemo(() => {
    const shortcuts = pageMode ? [...markdownShortcuts, ...pageShortcuts] : markdownShortcuts
    const query = shortcutQuery.trim().toLocaleLowerCase()
    if (!query) return shortcuts

    return shortcuts.filter(({ keys, description }) =>
      `${keys} ${description}`.toLocaleLowerCase().includes(query),
    )
  }, [pageMode, shortcutQuery])

  /**
   * 将跨平台快捷键转换为当前系统对应的修饰键显示。
   */
  const getShortcutKeys = (keys: string): string =>
    keys.replace("Cmd / Ctrl", isMacOS() ? "Cmd" : "Ctrl")

  const pageNameControls = pageMode && pages.length > 0 && (
    <div className="flex shrink-0 items-center">
      {isEditingPageName ? (
        <input
          autoFocus
          aria-label="页面名称"
          className="min-w-[4ch] max-w-[12ch] border-b border-white/20 bg-transparent px-1 text-center text-xs text-white/80 outline-none"
          style={{ width: `${Math.min(Math.max(pageName.length, 4), 12)}ch` }}
          title={pageName}
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
        <button
          type="button"
          aria-label={`编辑页面名称 ${pageName}`}
          className="min-w-[4ch] max-w-[12ch] truncate px-1 text-center text-xs text-white/65 hover:text-white/90"
          title={pageName}
          onClick={() => {
            pageNameBeforeEditRef.current = pageName
            setIsEditingPageName(true)
          }}
        >
          {pageName}
        </button>
      )}
    </div>
  )

  const pageSwitchControls = pageMode && pages.length > 0 && (
    <div className="flex shrink-0 items-center gap-0.5">
      <LxIconButton
        aria-label="上一页"
        disabled={activePageIndex === 0}
        size="medium"
        title={{ content: "上一页" }}
        onClick={() => onPageChange?.(activePageIndex - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </LxIconButton>
      <span className="text-[11px] text-white/35">
        {activePageIndex + 1} / {pages.length}
      </span>
      <LxIconButton
        aria-label="下一页"
        disabled={activePageIndex === pages.length - 1}
        size="medium"
        title={{ content: "下一页" }}
        onClick={() => onPageChange?.(activePageIndex + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </LxIconButton>
    </div>
  )

  /**
   * 第一次点击进入确认态，第二次点击才真正删除页面。
   */
  const handleDeletePageClick = (): void => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }
    setIsConfirmingDelete(false)
    setIsPageMenuOpen(false)
    onDeletePage?.()
  }

  const pageMenu = pageMode && (
    <LxTooltip
      content={
        <div className="flex min-w-36 flex-col gap-0.5">
          <LxMenuItem
            leading={<Plus className="h-3.5 w-3.5 text-white/45" />}
            onClick={() => {
              setIsPageMenuOpen(false)
              setIsConfirmingDelete(false)
              onCreatePage?.()
            }}
          >
            添加页面
          </LxMenuItem>
          <LxMenuItem
            className="disabled:opacity-35"
            disabled={pages.length === 0}
            leading={<Edit3 className="h-3.5 w-3.5 text-white/45" />}
            onClick={() => {
              pageNameBeforeEditRef.current = pageName
              setIsPageMenuOpen(false)
              setIsConfirmingDelete(false)
              setIsEditingPageName(true)
            }}
          >
            重命名页面
          </LxMenuItem>
          <LxMenuItem
            active={isConfirmingDelete}
            className="disabled:opacity-35"
            danger
            disabled={pages.length <= 1}
            leading={
              <Trash2
                className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
              />
            }
            onClick={handleDeletePageClick}
          >
            {isConfirmingDelete ? "确认删除" : "删除页面"}
          </LxMenuItem>
        </div>
      }
      contentClassName="!p-1"
      onOpenChange={(isOpen) => {
        setIsPageMenuOpen(isOpen)
        if (!isOpen) setIsConfirmingDelete(false)
      }}
      open={isPageMenuOpen}
      placement="bottom"
      trigger="click"
    >
      <LxIconButton aria-label="页面菜单" size="medium">
        <MoreVertical className="h-3.5 w-3.5" />
      </LxIconButton>
    </LxTooltip>
  )

  const tablePicker = useMemo(
    () => (
      <div className="flex flex-col gap-1" aria-label="选择表格大小">
        <div className="px-0.5 text-center text-[11px] text-white/70" aria-live="polite">
          {tableSize ? `${tableSize.columns} x ${tableSize.rows}` : "选择表格大小"}
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
                  aria-label={`${columns} columns ${rows} rows`}
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
    [onInsertTable, tableSize],
  )

  const shortcutList = (
    <div className="flex w-80 flex-col gap-2" aria-label="Markdown 编辑器快捷键">
      <LxInput
        aria-label="筛选快捷键"
        placeholder="筛选快捷键或说明"
        prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
        size="xs"
        value={shortcutQuery}
        onChange={(event) => setShortcutQuery(event.target.value)}
      />
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {filteredShortcuts.map(({ keys, description }) => (
            <div
              key={keys}
              className="flex min-h-7 items-center justify-between gap-3 rounded-[3px] px-1.5 text-xs hover:bg-white/5"
            >
              <span className="min-w-0 text-white/55">{description}</span>
              <kbd className="shrink-0 font-mono text-[11px] text-white/75">
                {getShortcutKeys(keys)}
              </kbd>
            </div>
          ))}
        </div>
        {filteredShortcuts.length === 0 && (
          <div className="py-4 text-center text-xs text-white/45">未找到匹配的快捷键</div>
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
      {leftActions.map(({ highlighted, icon: Icon, label, onClick }) => (
        <LxIconButton
          key={label}
          aria-label={label}
          highlighted={highlighted}
          size="medium"
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
          aria-label="插入表格"
          size="medium"
          onClick={() => setTableSize(null)}
          onMouseEnter={() => setTableSize(null)}
        >
          <Table2 className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>
      <LxTooltip content={shortcutList} placement="bottom" trigger="click" contentClassName="!p-2">
        <LxIconButton aria-label="快捷键" size="medium">
          <Keyboard className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>
      {rightActions.map(({ highlighted, icon: Icon, label, onClick }, index) => (
        <LxIconButton
          key={label}
          aria-label={label}
          className={index === 0 ? "ml-auto" : ""}
          highlighted={highlighted}
          size="medium"
          title={{ content: label }}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </LxIconButton>
      ))}
      {pageSwitchControls}
      {pageMenu}
      <LxTooltip content={isSaved ? "已保存" : "未保存"} placement="bottom">
        <span
          aria-label={isSaved ? "已保存" : "未保存"}
          className={`mx-1.5 h-2 w-2 shrink-0 rounded-full ${isSaved ? "bg-emerald-400" : "bg-amber-400"}`}
          role="status"
        />
      </LxTooltip>
    </div>
  )
}
