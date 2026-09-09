import { AlignLeft, AlignVerticalJustifyStart, CornerDownRight, FolderTree } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
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
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [visible, shouldRender])

  if (!shouldRender || !position) return null

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

  return (
    <div
      aria-label={t("markdown.colonMenuAria")}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={position}
    >
      {options.map((option, index) => {
        const isActive = index === activeIndex
        const Icon = option.icon

        return (
          <div
            key={option.type}
            data-index={index}
            aria-selected={isActive}
            className={`group relative flex min-h-10 w-full cursor-pointer flex-col justify-center rounded-[4px] px-2.5 py-1 text-left transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75 hover:bg-white/5"
            }`}
            role="option"
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect?.(option.type)
            }}
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
          </div>
        )
      })}
    </div>
  )
}
