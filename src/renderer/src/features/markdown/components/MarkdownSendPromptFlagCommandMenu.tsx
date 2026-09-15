import { CornerDownLeft } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownSendPromptFlagOption } from "@/features/markdown/commands/markdownSlashCommands"
import { useTranslation } from "@/i18n"

// Prompt 运行标志位选择面板属性。
interface MarkdownSendPromptFlagCommandMenuProps {
  options?: MarkdownSendPromptFlagOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (option: MarkdownSendPromptFlagOption) => void
}

/**
 * 渲染紧贴编辑器光标的 Prompt 发送标志位三级选择面板（/sendPrompt <target> - 三级面板）。
 */
export const MarkdownSendPromptFlagCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
  onSelect,
}: MarkdownSendPromptFlagCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = options && position ? { position, activeIndex, options } : null

  return (
    <LxCommandPanel
      ariaLabel={t("markdown.sendPromptFlagMenuLabel")}
      className="markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      data={panelData}
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.options.map((option, index) => {
            const isActive = index === displayData.activeIndex

            return (
              <LxCommandPanelItem
                key={option.id}
                active={isActive}
                className="mb-0.5 flex min-h-8 items-center gap-2 px-2 py-1.5 text-xs last:mb-0"
                index={index}
                leading={<CornerDownLeft className="h-3.5 w-3.5 flex-none text-sky-400" />}
                onSelect={() => onSelect?.(option)}
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="shrink-0 font-mono text-[13px] leading-none text-white">
                    {option.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] leading-none text-white/45">
                    {option.description}
                  </span>
                  <LxTag
                    bgClass="bg-sky-500/20 text-sky-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    {option.tag}
                  </LxTag>
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
