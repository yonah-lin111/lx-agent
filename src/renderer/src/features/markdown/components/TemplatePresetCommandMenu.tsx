import { Bug, CheckSquare, Layers, Palette, PlusCircle, RefreshCw } from "lucide-react"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { TemplatePresetOption } from "@/features/markdown/commands/markdownSlashCommands"
import { useTranslation } from "@/i18n"

export interface TemplatePresetCommandMenuProps {
  options?: TemplatePresetOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (option: TemplatePresetOption) => void
}

const getPresetIcon = (id: string): React.JSX.Element => {
  switch (id) {
    case "add":
      return <PlusCircle className="h-3.5 w-3.5 text-emerald-400" />
    case "bug":
      return <Bug className="h-3.5 w-3.5 text-rose-400" />
    case "refactor":
      return <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
    case "common":
      return <CheckSquare className="h-3.5 w-3.5 text-sky-400" />
    case "style":
      return <Palette className="h-3.5 w-3.5 text-purple-400" />
    case "all":
    default:
      return <Layers className="h-3.5 w-3.5 text-indigo-400" />
  }
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
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    options: TemplatePresetOption[]
    activeIndex: number
    position: CSSProperties
  } | null>(null)

  if (visible && options && position) {
    lastDataRef.current = { options, activeIndex, position }
  }

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

  if (!shouldRender) return null

  const displayData =
    visible && options && position ? { options, activeIndex, position } : lastDataRef.current
  if (!displayData) return null

  const {
    options: displayOptions,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  return (
    <div
      aria-label={t("markdown.selectTemplatePreset")}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayOptions.map((option, index) => {
        const isActive = index === displayActiveIndex

        return (
          <div
            key={option.id}
            data-index={index}
            aria-selected={isActive}
            className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left text-xs transition-colors mb-0.5 last:mb-0 ${
              isActive ? "bg-white/8 text-white" : "text-white/75 hover:bg-white/5"
            }`}
            role="option"
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect?.(option)
            }}
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5">
              {getPresetIcon(option.id)}
            </span>
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[13px] leading-none text-white">{option.name}</span>
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
          </div>
        )
      })}
    </div>
  )
}
