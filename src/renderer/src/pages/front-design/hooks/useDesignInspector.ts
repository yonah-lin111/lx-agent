import type React from "react"
import { useCallback, useEffect, useState } from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { generateElementSelector } from "@/features/agent/utils/designSynthesizer"
import { useTranslation } from "@/i18n"

export interface UseDesignInspectorOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  html: string
  activeDesignId: string | null
  sessionId: string | null
  title: string
  parentId?: string | null
  mode?: "tailwindcss" | "css"
  isStreaming: boolean
}

export interface UseDesignInspectorResult {
  isInspectorActive: boolean
  setIsInspectorActive: React.Dispatch<React.SetStateAction<boolean>>
  // 供 iframe onLoad 与刷新时重新挂载快捷键监听。
  attachIframeKeydown: () => void
}

/**
 * 画布元素点选（Inspector）域：开关状态、快捷键、iframe 高亮浮层与 @design 引用回填。
 */
export const useDesignInspector = ({
  iframeRef,
  html,
  activeDesignId,
  sessionId,
  title,
  parentId,
  mode,
  isStreaming,
}: UseDesignInspectorOptions): UseDesignInspectorResult => {
  const { t } = useTranslation()
  const { success: successToast } = useLxAgentToast()
  const [isInspectorActive, setIsInspectorActive] = useState<boolean>(false)

  // 当画布清空、无激活设计或 Agent 正在流式生成时自动退出微调模式
  useEffect(() => {
    if (!html || !activeDesignId || isStreaming) {
      setIsInspectorActive(false)
    }
  }, [html, activeDesignId, isStreaming])

  // Shift + Alt 快捷键切换元素点选模式（Toggle，同时支持按 ESC 键或点击工具栏按钮退出）
  const handleShortcutKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isShiftOrAlt = e.key === "Shift" || e.key === "Alt"
      if (!isShiftOrAlt || !e.shiftKey || !e.altKey) return
      // 流式输出中或无激活设计时静默忽略
      if (isStreaming || !html || !activeDesignId) return

      // 防误触保护：若当前输入焦点位于 input、textarea 或可编辑元素内，则忽略
      const target =
        (e.target as HTMLElement | null) || (document.activeElement as HTMLElement | null)
      if (target) {
        const tagName = target.tagName?.toLowerCase()
        if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
          return
        }
      }

      setIsInspectorActive((prev) => !prev)
    },
    [isStreaming, html, activeDesignId],
  )

  // 全局主窗口监听 Shift + Alt
  useEffect(() => {
    window.addEventListener("keydown", handleShortcutKeyDown)
    return () => window.removeEventListener("keydown", handleShortcutKeyDown)
  }, [handleShortcutKeyDown])

  // 全局 ESC 键监听退出点选模式
  useEffect(() => {
    if (!isInspectorActive) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setIsInspectorActive(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isInspectorActive])

  // 跨作用域将 Shift + Alt 监听挂载到 iframe 内部文档
  const attachIframeKeydown = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (doc) {
        doc.removeEventListener("keydown", handleShortcutKeyDown, true)
        doc.addEventListener("keydown", handleShortcutKeyDown, true)
      }
    } catch {
      // 跨域防御
    }
  }, [iframeRef, handleShortcutKeyDown])

  // 画布检查器 (Inspector Mode)：在 iframe 内注入高亮浮层与点击监听
  useEffect(() => {
    if (!isInspectorActive) return
    const iframe = iframeRef.current
    if (!iframe) return

    let doc: Document | null = null
    try {
      doc = iframe.contentDocument
    } catch {
      // 跨域防御
    }
    if (!doc || !doc.body) return

    const overlayId = "lx-design-inspector-overlay"
    let overlay = doc.getElementById(overlayId) as HTMLElement | null
    if (!overlay) {
      overlay = doc.createElement("div")
      overlay.id = overlayId
      overlay.style.position = "fixed"
      overlay.style.pointerEvents = "none"
      overlay.style.zIndex = "2147483647"
      overlay.style.border = "2px solid #ec4899"
      overlay.style.backgroundColor = "rgba(236, 72, 153, 0.12)"
      overlay.style.borderRadius = "4px"
      overlay.style.display = "none"
      overlay.style.boxSizing = "border-box"
      overlay.style.transition = "all 0.05s ease-out"

      const badge = doc.createElement("div")
      badge.id = `${overlayId}-badge`
      badge.style.position = "absolute"
      badge.style.top = "-24px"
      badge.style.left = "0px"
      badge.style.backgroundColor = "#ec4899"
      badge.style.color = "#ffffff"
      badge.style.fontSize = "11px"
      badge.style.fontWeight = "600"
      badge.style.padding = "2px 6px"
      badge.style.borderRadius = "3px"
      badge.style.whiteSpace = "nowrap"
      badge.style.pointerEvents = "none"
      badge.style.fontFamily = "ui-monospace, monospace"
      badge.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)"
      overlay.appendChild(badge)

      doc.body.appendChild(overlay)
    }

    const prevCursor = doc.body.style.cursor
    doc.body.style.cursor = "crosshair"

    let currentHovered: HTMLElement | null = null

    const handleMouseMove = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (
        !target ||
        target === overlay ||
        target === doc!.body ||
        target === doc!.documentElement
      ) {
        if (overlay) overlay.style.display = "none"
        currentHovered = null
        return
      }

      currentHovered = target
      const rect = target.getBoundingClientRect()
      if (overlay) {
        overlay.style.display = "block"
        overlay.style.top = `${rect.top}px`
        overlay.style.left = `${rect.left}px`
        overlay.style.width = `${rect.width}px`
        overlay.style.height = `${rect.height}px`

        const badge = overlay.firstElementChild as HTMLElement | null
        if (badge) {
          const tagName = target.tagName.toLowerCase()
          const id = target.id ? `#${target.id}` : ""
          const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`
          badge.textContent = `${tagName}${id} | ${dims}`
          if (rect.top < 26) {
            badge.style.top = "2px"
            badge.style.left = "2px"
          } else {
            badge.style.top = "-24px"
            badge.style.left = "0px"
          }
        }
      }
    }

    const handleMouseLeave = (): void => {
      if (overlay) overlay.style.display = "none"
      currentHovered = null
    }

    const handleClick = async (e: MouseEvent): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()

      const target = currentHovered || (e.target as HTMLElement | null)
      if (
        !target ||
        target === overlay ||
        target === doc!.body ||
        target === doc!.documentElement
      ) {
        return
      }

      // 移除 overlay 避免序列化进入快照
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }

      const { selector, description, injectedAttr } = generateElementSelector(target)

      // 如果动态挂载了 data-design-id，同步刷回 frontDesignStore 保证选择器 100% 精确命中
      if (injectedAttr && activeDesignId) {
        let fullHtml = doc!.documentElement.outerHTML
        if (!/<!doctype\s+html/i.test(fullHtml)) {
          fullHtml = `<!DOCTYPE html>\n${fullHtml}`
        }
        frontDesignStore.registerDesign({
          id: activeDesignId,
          parentId,
          title,
          html: fullHtml,
          sessionId,
          mode,
        })
      }

      // 将 overlay 放回 doc.body 继续支持后续点选
      if (overlay && doc && doc.body) {
        doc.body.appendChild(overlay)
      }

      const cleanSelector = selector.startsWith("#") ? selector.slice(1) : selector
      const mentionToken = `@design:${activeDesignId}#${cleanSelector} (${description}) `

      let targetTabId = agentTabStore.getActiveTabId()
      if (sessionId) {
        const targetTab = agentTabStore.findTabBySessionId(sessionId)
        if (targetTab) {
          targetTabId = targetTab.id
        }
      }

      await agentApi
        .setCollaborationMode("design", sessionId ?? undefined, targetTabId)
        .catch(() => {})
      agentTabStore.insertPromptToActiveTab(mentionToken)

      // 轻量 Toast 提示回填成功，保持点选模式允许连续点选
      successToast(t("frontDesign.elementSelectedToast", { name: description }))
    }

    const handleDocKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setIsInspectorActive(false)
      }
    }

    doc.addEventListener("mousemove", handleMouseMove, true)
    doc.addEventListener("mouseleave", handleMouseLeave, true)
    doc.addEventListener("click", handleClick, true)
    doc.addEventListener("keydown", handleDocKeyDown, true)

    return () => {
      try {
        if (doc) {
          doc.removeEventListener("mousemove", handleMouseMove, true)
          doc.removeEventListener("mouseleave", handleMouseLeave, true)
          doc.removeEventListener("click", handleClick, true)
          doc.removeEventListener("keydown", handleDocKeyDown, true)
          if (doc.body) {
            doc.body.style.cursor = prevCursor
          }
          const el = doc.getElementById(overlayId)
          if (el && el.parentNode) {
            el.parentNode.removeChild(el)
          }
        }
      } catch {
        // ignore
      }
    }
  }, [
    isInspectorActive,
    iframeRef,
    activeDesignId,
    parentId,
    title,
    sessionId,
    mode,
    successToast,
    t,
  ])

  return { isInspectorActive, setIsInspectorActive, attachIframeKeydown }
}
