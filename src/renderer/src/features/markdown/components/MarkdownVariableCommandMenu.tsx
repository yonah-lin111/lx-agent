import { Braces } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import {
  getVariableTag,
  type MarkdownVariableEntry,
} from "@/features/markdown/commands/markdownVariableCommands"
import { useTranslation } from "@/i18n"

// 页面变量菜单属性。
export interface MarkdownVariableCommandMenuProps {
  variables?: MarkdownVariableEntry[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  triggerChar?: "$" | "¥"
  onSelect?: (variable: MarkdownVariableEntry) => void
}

/**
 * 渲染紧贴编辑器光标的 Markdown 页面预设变量命令菜单。
 */
export const MarkdownVariableCommandMenu = ({
  variables,
  activeIndex = 0,
  position,
  visible = false,
  triggerChar = "$",
  onSelect,
}: MarkdownVariableCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = variables && position ? { position, activeIndex, variables, triggerChar } : null

  return (
    <LxCommandPanel
      ariaLabel={t("markdown.variableMenuAria")}
      className="markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data={panelData}
      scrollActiveItem
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.variables.map((variable, index) => {
            const isActive = index === displayData.activeIndex
            const preview = variable.value.replaceAll("\n", " ").trim()

            return (
              <LxCommandPanelItem
                key={variable.name}
                active={isActive}
                className="group relative flex min-h-11 flex-col justify-center px-2 py-1"
                index={index}
                onSelect={() => onSelect?.(variable)}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-amber-400/10 text-amber-300">
                    <Braces className="h-3 w-3" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="shrink-0 font-mono text-[13px] font-medium text-white">
                      {displayData.triggerChar}
                      {variable.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/45">
                      {preview || t("markdown.variableNoPreview")}
                    </span>
                  </span>
                  <LxTag
                    bgClass="border-amber-400/20 bg-amber-400/10 text-amber-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    {getVariableTag(variable.name)}
                  </LxTag>
                </div>
                {isActive && (
                  <div className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded border border-white/5 bg-black/20 p-1.5 font-mono text-[11px] text-white/60">
                    {variable.value || t("markdown.variableNoPreview")}
                  </div>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
