import { ExternalLink, FolderOpen, GitBranch, Palette } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LxCodeBlock } from "@/components/ui/LxCodeBlock"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import type { FrontDesignData } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

export interface FrontDesignCardProps {
  design: FrontDesignData
  isStreaming?: boolean
}

/**
 * FrontDesignCard - 渲染消息流中捕获的 <front_design> 前端设计卡片。
 * 视觉风格与结构对齐 ReviewFindingsCard，支持展示代码与统计指标，并可一键打开本地工程目录或跳转看板。
 */
export const FrontDesignCard = ({
  design,
  isStreaming = false,
}: FrontDesignCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const isGenerating = isStreaming || Boolean(design.isStreaming)
  const title = design.title || t("frontDesign.title")
  const mode = design.mode ?? "tailwindcss"
  const lines = useMemo(() => design.html.split("\n"), [design.html])
  const lineCount = lines.length
  const byteSize = useMemo(() => new Blob([design.html]).size, [design.html])
  const sizeFormatted = useMemo(() => {
    if (byteSize < 1024) return `${byteSize} B`
    return `${(byteSize / 1024).toFixed(1)} KB`
  }, [byteSize])

  const DEFAULT_VISIBLE_LINES = 20
  const hasMoreLines = lineCount > DEFAULT_VISIBLE_LINES
  const [isCodeExpanded, setIsCodeExpanded] = useState(false)

  const displayedHtml = useMemo(() => {
    if (isCodeExpanded || !hasMoreLines) {
      return design.html
    }
    return lines.slice(0, DEFAULT_VISIBLE_LINES).join("\n")
  }, [design.html, isCodeExpanded, hasMoreLines, lines])

  const handleOpenDesign = (): void => {
    const targetId = design.id || `design-default`
    const existing = frontDesignStore.getDesign(targetId)
    if (!existing) {
      frontDesignStore.registerDesign({
        id: targetId,
        parentId: design.parentId,
        version: design.version,
        title: design.title || t("frontDesign.title"),
        html: design.html,
        isStreaming: isGenerating,
        sessionId: design.sessionId,
        autoActivate: true,
        mode: design.mode,
        designDir: design.designDir,
      })
    }
    if (design.sessionId) {
      const targetTab = agentTabStore.findTabBySessionId(design.sessionId)
      if (targetTab && targetTab.id !== agentTabStore.getActiveTabId()) {
        agentTabStore.switchTab(targetTab.id)
      }
    }
    frontDesignStore.setActiveDesignId(targetId)
    navigate(PAGE_ROUTES.design)
  }

  const handleOpenDirectory = async (): Promise<void> => {
    if (!design.sessionId || !design.id) return
    await agentApi.openDesignDir(design.sessionId, design.id)
  }

  const handleIterate = async (): Promise<void> => {
    const targetId = design.id || "design-default"
    const targetTitle = design.title || t("frontDesign.title")
    let targetTabId = agentTabStore.getActiveTabId()

    if (design.sessionId) {
      const targetTab = agentTabStore.findTabBySessionId(design.sessionId)
      if (targetTab) {
        targetTabId = targetTab.id
        if (targetTab.id !== agentTabStore.getActiveTabId()) {
          agentTabStore.switchTab(targetTab.id)
        }
      }
    }

    // 确保切换为 design 协作模式
    await agentApi
      .setCollaborationMode("design", design.sessionId ?? undefined, targetTabId)
      .catch(() => {})

    // 填入 @design Token 并聚焦
    const mentionToken = `@design:${targetId} (${targetTitle}) `
    agentTabStore.insertPromptToActiveTab(mentionToken)
  }

  return (
    <div className="front-design-card my-2.5 w-full min-w-0 rounded-[6px] border border-pink-500/25 bg-pink-500/[0.03] p-3.5 shadow-sm transition-all duration-200">
      {/* 头部第一行：图标、Front Design Prototype 与生成中提示 */}
      <div className="front-design-header flex items-center gap-2 border-b border-pink-500/15 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="front-design-icon-wrapper flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pink-500/15 text-pink-400">
            <Palette className="h-3.5 w-3.5" />
          </div>
          <span className="front-design-badge shrink-0 rounded border border-pink-500/20 bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-medium text-pink-300">
            {t("frontDesign.prototypeBadge")}
          </span>
        </div>
      </div>

      {/* 单独一行的 title 与统计 Chip */}
      <div className="front-design-title-row mt-2.5 flex items-center gap-2 flex-wrap">
        <span className="front-design-title truncate text-[13px] font-semibold text-white/95">
          {title}
        </span>

        {/* 版本徽标 */}
        {design.version && (
          <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.2 text-[10px] font-medium text-pink-300">
            v{design.version}
          </span>
        )}

        {/* 定向节点标示 */}
        {design.target && (
          <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.2 text-[10px] font-mono text-pink-300">
            {design.target}
          </span>
        )}

        {/* 基准血缘标示 */}
        {design.parentId && (
          <span className="text-[11px] text-pink-300/60 truncate max-w-[200px]">
            {t("frontDesign.basedOnPrefix")} {design.parentId}
          </span>
        )}

        {/* 统计指标 Chip */}
        <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.2 text-[10px] font-medium text-pink-300">
          {lineCount} {t("frontDesign.lines")}
        </span>
        <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.2 text-[10px] font-medium text-pink-300">
          {sizeFormatted}
        </span>
        <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1.5 py-0.2 text-[10px] font-medium text-pink-300">
          {mode === "css" ? t("frontDesign.pureCssMode") : t("frontDesign.tailwindMode")}
        </span>
      </div>

      {/* 概要说明区：对齐 ReviewFindingsCard 的 summary 布局 */}
      <div className="front-design-summary mt-2.5 rounded-[6px] bg-black/20 px-3 py-2 text-[12.5px] leading-relaxed text-white/80">
        <span className="text-[12px] text-white/75">{t("frontDesign.summaryDesc")}</span>
      </div>

      {/* 代码预览容器：默认显示 20 行，流式输出完毕后再显示，支持点击更多展开 */}
      {!isGenerating && design.html.trim() && (
        <div className="front-design-code-wrapper mt-2.5">
          <div className="front-design-code-container rounded-[6px] border border-pink-500/15 bg-black/25 p-1 text-[12px] leading-relaxed">
            <LxCodeBlock
              code={displayedHtml}
              language="html"
              copyable={true}
              collapsible={true}
              copyContent={design.html}
            />
          </div>
          {hasMoreLines && (
            <div className="mt-1.5 flex items-center px-1">
              <button
                type="button"
                aria-expanded={isCodeExpanded}
                onClick={() => setIsCodeExpanded((prev) => !prev)}
                className="front-design-expand-toggle inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-[11px] font-medium text-pink-400/90 transition-colors hover:text-pink-300 select-none focus:outline-none"
              >
                <span className="italic underline underline-offset-2">
                  {isCodeExpanded
                    ? t("common.collapse")
                    : `...${t("common.more")} (${lineCount - DEFAULT_VISIBLE_LINES} ${t("frontDesign.lines")})`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 底部操作栏：对齐 ReviewFindingsCard 底部布局，右侧紧凑编排操作按钮 */}
      <div className="front-design-footer mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-pink-500/15 pt-2.5">
        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0 max-w-full">
          {design.sessionId && (
            <button
              type="button"
              onClick={handleOpenDirectory}
              className="front-design-dir-btn flex min-h-7 h-auto items-center gap-1 rounded-[6px] border border-white/10 px-2.5 py-1 text-[11.5px] text-white/80 transition-all max-w-full hover:bg-white/5 hover:text-white cursor-pointer"
            >
              <FolderOpen className="h-3 w-3 shrink-0" />
              <span className="break-words">{t("frontDesign.openDesignDir")}</span>
            </button>
          )}

          {/* 基于此迭代按钮 */}
          <button
            type="button"
            onClick={handleIterate}
            className="front-design-iterate-btn flex min-h-7 h-auto items-center gap-1.5 rounded-[6px] border border-pink-500/30 bg-pink-500/10 px-2.5 py-1 text-[11.5px] font-medium text-pink-300 hover:bg-pink-500/20 active:scale-[0.98] transition-all max-w-full cursor-pointer"
          >
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="break-words">{t("frontDesign.iterateAction")}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenDesign}
            className="front-design-open-btn flex min-h-7 h-auto items-start gap-1.5 rounded-[6px] bg-pink-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-pink-500 active:scale-[0.98] shadow-sm transition-all max-w-full cursor-pointer"
          >
            <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
            <span className="break-words">{t("frontDesign.openDesignPage")}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
