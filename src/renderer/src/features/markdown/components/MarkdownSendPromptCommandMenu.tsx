import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownSendPromptOption } from "@/features/markdown/commands/markdownSlashCommands"
import { CliIcon } from "@/features/settings"
import { useTranslation } from "@/i18n"

// Prompt 发送目标选择面板属性。
interface MarkdownSendPromptCommandMenuProps {
  options?: MarkdownSendPromptOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (option: MarkdownSendPromptOption) => void
}

/**
 * 渲染紧贴编辑器光标的 Prompt 发送目标二级选择面板（/sendPrompt 二级面板）。
 */
export const MarkdownSendPromptCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
  onSelect,
}: MarkdownSendPromptCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = options && position ? { position, activeIndex, options } : null

  return (
    <LxCommandPanel
      ariaLabel={t("markdown.sendPromptMenuLabel")}
      className="markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      data={panelData}
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.options.map((option, index) => {
            const isActive = index === displayData.activeIndex
            const isRunning = Boolean(option.isRunning)
            const isDefault = Boolean(option.isDefault)

            const activeClassName = isDefault
              ? "bg-purple-500/20 text-white"
              : isRunning
                ? "bg-emerald-500/20 text-white"
                : "bg-white/8 text-white"
            const idleClassName = isDefault
              ? "bg-purple-500/10 text-white/90 hover:bg-white/5"
              : isRunning
                ? "bg-emerald-500/10 text-white/90 hover:bg-white/5"
                : "text-white/75 hover:bg-white/5"

            return (
              <LxCommandPanelItem
                key={option.id}
                active={isActive}
                activeClassName={activeClassName}
                className="mb-0.5 flex min-h-8 items-center gap-2 px-2 py-1.5 text-xs last:mb-0"
                data-is-default={isDefault ? "true" : undefined}
                data-is-running={isRunning ? "true" : undefined}
                idleClassName={idleClassName}
                index={index}
                leading={
                  <CliIcon id={option.targetType || option.id} className="h-3.5 w-3.5 flex-none" />
                }
                onSelect={() => onSelect?.(option)}
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[13px] leading-none text-white">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="min-w-0 truncate text-[12px] leading-none text-white/45">
                        {option.description}
                      </span>
                    )}
                  </span>
                  <LxTag
                    bgClass={
                      isDefault
                        ? "bg-purple-500/20 text-purple-300"
                        : isRunning
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-white/10 text-white/50"
                    }
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
