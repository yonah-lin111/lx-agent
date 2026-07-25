import { Keyboard, Table2 } from "lucide-react"
import { useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { MarkdownTableSize, MarkdownToolbarAction } from "@/components/ui/LxMarkdown/types"

// 工具栏属性。
interface MarkdownEditorToolbarProps {
  actions: MarkdownToolbarAction[]
  onInsertTable: (size: MarkdownTableSize) => void
}

const markdownShortcuts = [
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
]

/**
 * 渲染 Markdown 编辑器的格式化工具栏。
 */
export const MarkdownEditorToolbar = ({
  actions,
  onInsertTable,
}: MarkdownEditorToolbarProps): React.JSX.Element => {
  const [tableSize, setTableSize] = useState<MarkdownTableSize | null>(null)
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

  return (
    <div className="flex h-9 flex-none items-center gap-0.5 overflow-x-auto border-b border-white/5 px-1.5">
      {actions.map(({ alignRight, highlighted, icon: Icon, label, onClick }) => (
        <LxIconButton
          key={label}
          aria-label={label}
          className={alignRight ? "ml-auto" : ""}
          highlighted={highlighted}
          size="medium"
          title={{ content: label }}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </LxIconButton>
      ))}
      <LxTooltip content={tablePicker} placement="bottom" trigger="both" contentClassName="!p-1.5">
        <LxIconButton
          aria-label="插入表格"
          size="medium"
          onClick={() => setTableSize(null)}
          onMouseEnter={() => setTableSize(null)}
        >
          <Table2 className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>
      <LxTooltip
        content={
          <div className="w-64 space-y-1" aria-label="Markdown 编辑器快捷键">
            {markdownShortcuts.map(({ keys, description }) => (
              <div key={keys} className="flex items-center justify-between gap-3 text-xs">
                <kbd className="font-mono text-[11px] text-white/75">{keys}</kbd>
                <span className="text-white/55">{description}</span>
              </div>
            ))}
          </div>
        }
        placement="bottom"
        trigger="click"
        contentClassName="!p-2"
      >
        <LxIconButton aria-label="快捷键" size="medium">
          <Keyboard className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>
    </div>
  )
}
