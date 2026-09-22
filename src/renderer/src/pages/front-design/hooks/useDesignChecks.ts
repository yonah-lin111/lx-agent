import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "@/i18n"
import type { A11yFinding, PreviewIssue } from "@/pages/front-design/types"
import { runA11yAudit } from "@/pages/front-design/utils/a11yAudit"
import { formatA11yFinding, formatRuntimeError } from "@/pages/front-design/utils/issueFormat"
import { mergePreviewErrors, readPreviewErrors } from "@/pages/front-design/utils/previewGuard"

// 运行时错误轮询间隔与审计延迟（等脚本执行与布局稳定）。
const POLL_INTERVAL_MS = 1000
const AUDIT_DELAY_MS = 300

export interface UseDesignChecksOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  activeDesignId: string | null
  hasHtml: boolean
  isStreaming: boolean
  refreshKey: number
}

export interface UseDesignChecksResult {
  issues: PreviewIssue[]
  selectedIssues: PreviewIssue[]
  runtimeCount: number
  a11yCount: number
  isPanelOpen: boolean
  setIsPanelOpen: (open: boolean) => void
  selectedIds: Set<string>
  toggleIssue: (id: string) => void
  toggleAll: () => void
  isAllSelected: boolean
  clearSelection: () => void
  rerun: () => void
  scheduleAudit: () => void
}

/**
 * 画布体检域：运行时错误轮询、可用性审计、勾选状态与计数。
 */
export const useDesignChecks = ({
  iframeRef,
  activeDesignId,
  hasHtml,
  isStreaming,
  refreshKey,
}: UseDesignChecksOptions): UseDesignChecksResult => {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t

  const [runtimeIssues, setRuntimeIssues] = useState<PreviewIssue[]>([])
  const [a11yFindings, setA11yFindings] = useState<A11yFinding[]>([])
  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [auditToken, setAuditToken] = useState<number>(0)

  const runtimeSignatureRef = useRef<string>("")
  const canCheck = hasHtml && !isStreaming

  // 轮询读取 iframe 错误缓冲；签名未变化时不触发重渲染，避免每秒抖动。
  useEffect(() => {
    if (!canCheck) {
      runtimeSignatureRef.current = ""
      setRuntimeIssues([])
      return
    }

    const read = (): void => {
      const doc = iframeRef.current?.contentDocument
      const merged = mergePreviewErrors(readPreviewErrors(doc), (sample) =>
        formatRuntimeError(sample, tRef.current),
      )
      const signature = merged.map((issue) => `${issue.id}#${issue.count}`).join("|")
      if (signature === runtimeSignatureRef.current) return
      runtimeSignatureRef.current = signature
      setRuntimeIssues(merged)
    }

    read()
    const timer = window.setInterval(read, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [canCheck, activeDesignId, refreshKey, iframeRef])

  // 审计：设计切换、手动刷新、iframe 加载完成与手动重跑时执行。
  useEffect(() => {
    if (!canCheck) {
      setA11yFindings([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      const doc = iframeRef.current?.contentDocument
      if (!doc?.body) return
      setA11yFindings(runA11yAudit(doc))
    }, AUDIT_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [canCheck, activeDesignId, refreshKey, auditToken, iframeRef])

  const issues = useMemo<PreviewIssue[]>(
    () => [...runtimeIssues, ...a11yFindings.map((finding) => formatA11yFinding(finding, t))],
    [runtimeIssues, a11yFindings, t],
  )

  // 问题列表变化时清理失效的勾选项（无变化时保持原引用，避免重渲染循环）。
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const validIds = new Set(issues.map((issue) => issue.id))
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [issues])

  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIds.has(issue.id)),
    [issues, selectedIds],
  )

  const toggleIssue = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isAllSelected = issues.length > 0 && selectedIds.size === issues.length

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === issues.length ? new Set() : new Set(issues.map((issue) => issue.id)),
    )
  }, [issues])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const rerun = useCallback(() => {
    setAuditToken((token) => token + 1)
  }, [])

  const scheduleAudit = useCallback(() => {
    setAuditToken((token) => token + 1)
  }, [])

  return {
    issues,
    selectedIssues,
    runtimeCount: runtimeIssues.length,
    a11yCount: a11yFindings.length,
    isPanelOpen,
    setIsPanelOpen,
    selectedIds,
    toggleIssue,
    toggleAll,
    isAllSelected,
    clearSelection,
    rerun,
    scheduleAudit,
  }
}
