import { AlignLeft, AlignVerticalJustifyStart, CornerDownRight, FolderTree } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import type { MarkdownColonOptionType } from "@/features/markdown/hooks/useMarkdownColonPanel"
import { useTranslation } from "@/i18n"

export interface MarkdownColonCommandMenuProps {
  keyName: string
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (type: MarkdownColonOptionType) => void
}

/**
 * 在 $$$ 变量模板块内输入冒号后弹出的“单行 / 多行 / 嵌套”选择菜单。
 */
export const MarkdownColonCommandMenu = ({
  keyName,
  activeIndex = 0,
  position,
  visible = false,
  onSelect,
}: MarkdownColonCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()

  const options: Array<{
    type: MarkdownColonOptionType
    label: string
    preview: string
    icon: typeof AlignLeft
  }> = [
    {
      type: "single",
      label: t("markdown.colonSingleLine"),
      preview: `${keyName}: "var"`,
      icon: AlignLeft,
    },
    {
      type: "multi",
      label: t("markdown.colonMultiLine"),
      preview: `${keyName}:\n  """\n  var\n  """`,
      icon: AlignVerticalJustifyStart,
    },
    {
      type: "nestedSingle",
      label: t("markdown.colonNestedSingleLine"),
      preview: `${keyName}:\n  key: "var"`,
      icon: CornerDownRight,
    },
    {
      type: "nestedMulti",
      label: t("markdown.colonNestedMultiLine"),
      preview: `${keyName}:\n  key:\n    """\n    var\n    """`,
      icon: FolderTree,
    },
  ]

  const panelData = position ? { position, activeIndex, options } : null

  return (
    <LxCommandPanel
      ariaLabel={t("markdown.colonMenuAria")}
      className="markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data={panelData}
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.options.map((option, index) => {
            const isActive = index === displayData.activeIndex
            const Icon = option.icon

            return (
              <LxCommandPanelItem
                key={option.type}
                active={isActive}
                className="group relative flex min-h-10 flex-col justify-center px-2.5 py-1 text-xs"
                index={index}
                onSelect={() => onSelect?.(option.type)}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-purple-400/10 text-purple-300">
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="shrink-0 font-medium text-white">{option.label}</span>
                  <span className="ml-auto font-mono text-[11px] text-white/40">
                    {option.preview.replace(/\n\s*/g, " ")}
                  </span>
                </div>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
