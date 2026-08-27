import { FileCheck, FileText, Folder, Image as ImageIcon, Link, Upload } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@/i18n"

export interface MarkdownPasteReferenceOption {
  id: "reference" | "path" | "upload"
  label: string
  icon?: ReactNode
}

interface MarkdownPasteCommandMenuProps {
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  options?: MarkdownPasteReferenceOption[]
}

/**
 * 根据粘贴文件列表生成引用方式选项
 */
export const buildPasteReferenceOptions = (
  paths: { path: string; type: "folder" | "file" | "image" }[] = [],
  t: (key: any) => string,
  includeUpload = false,
): MarkdownPasteReferenceOption[] => {
  const isAllImages = paths.length > 0 && paths.every((item) => item.type === "image")
  const isAllFiles = paths.length > 0 && paths.every((item) => item.type === "file")
  const isAllFolders = paths.length > 0 && paths.every((item) => item.type === "folder")

  let referenceLabel = t("markdown.pasteReferenceContent")
  let ReferenceIcon = FileCheck

  if (isAllImages) {
    referenceLabel = t("markdown.pasteReferenceImage")
    ReferenceIcon = ImageIcon
  } else if (isAllFiles) {
    referenceLabel = t("markdown.pasteReferenceFile")
    ReferenceIcon = FileText
  } else if (isAllFolders) {
    referenceLabel = t("markdown.pasteReferenceFolder")
    ReferenceIcon = Folder
  }

  const items: MarkdownPasteReferenceOption[] = []

  if (includeUpload && !isAllFolders && paths.some((item) => item.type !== "folder")) {
    items.push({
      id: "upload",
      label: t("markdown.pasteUploadFile"),
      icon: <Upload className="h-4 w-4 shrink-0 text-[#34d399]" />,
    })
  }

  items.push(
    {
      id: "reference",
      label: referenceLabel,
      icon: <ReferenceIcon className="h-4 w-4 shrink-0 text-[#38bdf8]" />,
    },
    {
      id: "path",
      label: t("markdown.pasteReferencePath"),
      icon: <Link className="h-4 w-4 shrink-0 text-white/50" />,
    },
  )

  return items
}

/**
 * 渲染文件粘贴后的引用方式选择面板。
 */
export const MarkdownPasteCommandMenu = ({
  activeIndex = 0,
  position,
  visible = false,
  options: customOptions,
}: MarkdownPasteCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const defaultOptions = buildPasteReferenceOptions([], t)
  const options = customOptions && customOptions.length > 0 ? customOptions : defaultOptions

  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const lastDataRef = useRef<{
    activeIndex: number
    position: CSSProperties
    options: MarkdownPasteReferenceOption[]
  } | null>(null)

  if (visible && position) {
    lastDataRef.current = { activeIndex, position, options }
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
  const displayData = visible && position ? { activeIndex, position, options } : lastDataRef.current
  if (!displayData) return null

  return (
    <div
      aria-label={t("markdown.pasteReferenceAria")}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayData.position}
    >
      {displayData.options.map((option, index) => {
        const isSelected = index === displayData.activeIndex
        return (
          <div
            key={option.id}
            aria-selected={isSelected}
            className={`flex h-11 w-full items-center gap-2.5 rounded-[4px] px-3 text-left text-xs transition-colors ${
              isSelected ? "bg-white/8 text-white" : "text-white/75"
            }`}
            role="option"
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </div>
        )
      })}
    </div>
  )
}
