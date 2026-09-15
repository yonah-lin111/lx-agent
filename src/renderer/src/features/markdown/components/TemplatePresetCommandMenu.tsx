import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { TemplatePresetOption } from "@/features/markdown/commands/markdownSlashCommands"
import { getTemplatePresetIcon } from "@/features/markdown/components/markdownCommandIcons"
import { useTranslation } from "@/i18n"

export interface TemplatePresetCommandMenuProps {
  options?: TemplatePresetOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (option: TemplatePresetOption) => void
}

/**
 * 渲染紧贴编辑器光标的模板预设二级选择面板（/templatePreset 二级面板）。
 */
export const TemplatePresetCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
  onSelect,
}: TemplatePresetCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = options && position ? { position, activeIndex, options } : null

  return (
    <LxCommandPanel
      ariaLabel={t("markdown.selectTemplatePreset")}
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
                className="mb-0.5 flex min-h-10 items-center gap-2 px-2 text-xs last:mb-0"
                index={index}
                leading={
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5">
                    {getTemplatePresetIcon(option.id)}
                  </span>
                }
                onSelect={() => onSelect?.(option)}
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-[13px] leading-none text-white">
                      {option.name}
                    </span>
                    <span className="min-w-0 truncate text-[11px] leading-none text-white/45">
                      {option.description}
                    </span>
                  </span>
                  <LxTag
                    bgClass="bg-white/10 text-white/60"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    {option.label}
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
