import { Check, Copy, ExternalLink, Loader2, Palette } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxAgentToast } from "@/components/ui/LxToast"
import type { FrontDesignData } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

export interface FrontDesignCardProps {
  design: FrontDesignData
  isStreaming?: boolean
}

/**
 * FrontDesignCard - 渲染消息流中捕获的 <front_design> 前端设计卡片。
 * 紧凑展示原型标题、代码规模，并提供快速进入独立 FrontDesignPage 与复制代码操作。
 */
export const FrontDesignCard = ({
  design,
  isStreaming = false,
}: FrontDesignCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { success: successToast } = useLxAgentToast()
  const [copied, setCopied] = useState(false)

  const title = design.title || "Frontend Prototype"
  const lineCount = useMemo(() => design.html.split("\n").length, [design.html])
  const byteSize = useMemo(() => new Blob([design.html]).size, [design.html])
  const sizeFormatted = useMemo(() => {
    if (byteSize < 1024) return `${byteSize} B`
    return `${(byteSize / 1024).toFixed(1)} KB`
  }, [byteSize])

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(design.html)
      setCopied(true)
      successToast(t("frontDesign.copySuccess"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略
    }
  }

  return (
    <div className="front-design-card my-2 w-full rounded-[6px] border border-pink-500/20 bg-gradient-to-b from-[#1b1419] to-[#121013] p-3 text-xs shadow-sm">
      {/* 头部导航与标题 */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-pink-500/10 text-pink-400">
            <Palette className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white/90 truncate">{title}</span>
              <span className="shrink-0 rounded-[3px] bg-pink-500/15 px-1.5 py-0.2 text-[10px] font-medium text-pink-300">
                {t("frontDesign.designCardBadge")}
              </span>
              {(isStreaming || design.isStreaming) && (
                <Loader2 className="h-3 w-3 animate-spin text-pink-400 shrink-0" />
              )}
            </div>
            <span className="text-[11px] text-white/45">
              {lineCount} lines · {sizeFormatted} · Tailwind CSS
            </span>
          </div>
        </div>

        {/* 操作区 */}
        <div className="flex items-center gap-1 shrink-0">
          <LxIconButton
            size="small"
            onClick={handleCopy}
            aria-label={t("frontDesign.copyCode")}
            title={{ content: t("frontDesign.copyCode"), placement: "top" }}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-white/60" />
            )}
          </LxIconButton>

          <button
            type="button"
            onClick={() => navigate(PAGE_ROUTES.design)}
            className="flex items-center gap-1 rounded-[4px] bg-pink-600/80 hover:bg-pink-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors cursor-pointer"
          >
            <span>{t("frontDesign.openDesignPage")}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
