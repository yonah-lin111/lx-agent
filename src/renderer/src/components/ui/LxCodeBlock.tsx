import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { highlightCode } from "@/lib/codeHighlight"

export interface LxCodeBlockProps {
  /** 代码纯文本内容 */
  code: string
  /** 语言标识（如 "html", "typescript", "json" 等），默认 "plaintext" */
  language?: string
  /** 是否支持代码折叠，默认 true */
  collapsible?: boolean
  /** 初始是否折叠，默认 false */
  defaultCollapsed?: boolean
  /** 是否支持复制代码，默认 true */
  copyable?: boolean
  /** 自定义复制内容（如未指定则复制 code） */
  copyContent?: string
  /** 自定义类名 */
  className?: string
}

/**
 * 辅助写入系统剪贴板
 */
const copyToClipboard = async (content: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = content
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand("copy")
  textarea.remove()

  if (!copied) throw new Error("Clipboard copy failed")
}

/**
 * LxCodeBlock - 纯净独立代码块公共组件。
 * 视觉结构、交互行为及主题定制完全对齐 LxMarkdownPreview 代码块（.markdown-code-block），
 * 专供无需完整 Markdown 解析器即可展示高亮代码的场景复用。
 */
export const LxCodeBlock = ({
  code,
  language = "plaintext",
  collapsible = true,
  defaultCollapsed = false,
  copyable = true,
  copyContent,
  className = "",
}: LxCodeBlockProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [isCopied, setIsCopied] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const highlightedHtml = useMemo(() => {
    return highlightCode(code, language)
  }, [code, language])

  const handleCopy = useCallback(async (): Promise<void> => {
    const textToCopy = copyContent !== undefined ? copyContent : code
    try {
      await copyToClipboard(textToCopy)
      setIsCopied(true)
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setIsCopied(false)
        copyTimerRef.current = null
      }, 1500)
    } catch {
      setIsCopied(false)
    }
  }, [code, copyContent])

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev)
  }, [])

  return (
    <div className={`markdown-preview lx-code-block-wrapper ${className}`}>
      <section className={`markdown-code-block ${isCollapsed ? "is-collapsed" : ""}`}>
        <header className="markdown-code-block-header">
          <span className="markdown-code-language">{language}</span>
          <span className="markdown-code-actions">
            {copyable && (
              <span className="markdown-code-copy">
                <LxIconButton
                  aria-label={t("markdown.copyCode")}
                  preset={isCopied ? "confirm" : undefined}
                  size="small"
                  title={{
                    content: isCopied ? t("markdown.copiedCode") : t("markdown.copyCode"),
                    placement: "bottom",
                  }}
                  onClick={handleCopy}
                >
                  {isCopied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </LxIconButton>
              </span>
            )}
            {collapsible && (
              <span className="markdown-code-collapse">
                <LxIconButton
                  aria-label={
                    !isCollapsed ? t("markdown.collapseContent") : t("markdown.expandContent")
                  }
                  aria-expanded={!isCollapsed}
                  size="small"
                  title={{
                    content: !isCollapsed
                      ? t("markdown.collapseContent")
                      : t("markdown.expandContent"),
                    placement: "bottom",
                  }}
                  onClick={handleToggleCollapse}
                >
                  {!isCollapsed ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </LxIconButton>
              </span>
            )}
          </span>
        </header>
        <div
          className="markdown-code-content"
          style={{ display: isCollapsed ? "none" : undefined }}
        >
          <pre>
            <code
              className={`language-${language} hljs`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          </pre>
        </div>
      </section>
    </div>
  )
}
