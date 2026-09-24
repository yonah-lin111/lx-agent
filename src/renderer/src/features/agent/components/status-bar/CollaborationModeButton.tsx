import type { CollaborationMode } from "@shared/contracts/agent"
import { COLLABORATION_MODE_ORDER } from "@shared/contracts/agent"
import { Check } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { COLLABORATION_MODE_META } from "@/lib/collaborationModes"

interface CollaborationModeButtonProps {
  // 基础模式（用户选择；auto = 自动编排）。
  mode?: CollaborationMode
  // auto 编排下模型切出的有效模式（展示用；非 auto 缺省 = mode）。
  effectiveMode?: CollaborationMode
  // 点击弹层选择模式（缺省时退化为纯 hover 提示）。
  onModeChange?: (mode: CollaborationMode) => void
}

/**
 * Agent 状态栏协作模式指示（Build / Auto / Plan / Review / Design / Minimal 展示与点击选择）。
 * auto 基础模式下标签显示为「Auto · {有效模式}」，颜色随有效模式变化以体现当前约束。
 */
export const CollaborationModeButton = ({
  mode = "build",
  effectiveMode,
  onModeChange,
}: CollaborationModeButtonProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const isAuto = mode === "auto"
  const activeMode = isAuto ? (effectiveMode ?? "build") : mode
  const meta = COLLABORATION_MODE_META[activeMode]
  const baseMeta = COLLABORATION_MODE_META[mode]

  const hoverContent = (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-white/90">
          {isAuto && activeMode !== "build"
            ? `${t(baseMeta.labelKey)} · ${t(meta.labelKey)}`
            : t(meta.labelKey)}
        </span>
        <span className="text-white/60">{t(meta.descKey)}</span>
        {isAuto && activeMode !== "build" && (
          <span className="text-white/45">{t(baseMeta.descKey)}</span>
        )}
      </div>
      <div className="border-t border-white/10 pt-1 text-xs text-white/45">
        {t("agent.collaborationModeShortcutHint")}
      </div>
    </div>
  )

  // 有效模式为 build 时保持 auto 自身的图标与色板；只读有效模式下切换为对应模式的视觉信号。
  const tagMeta = isAuto && activeMode === "build" ? baseMeta : meta
  const tag = (
    <LxTag
      size="small"
      variant="ghost"
      color={tagMeta.color}
      className="shrink-0"
      prefix={<tagMeta.Icon className="h-3.5 w-3.5 shrink-0" />}
    >
      {isAuto ? `${baseMeta.shortName} · ${meta.shortName}` : meta.shortName}
    </LxTag>
  )

  if (!onModeChange) {
    return (
      <LxTooltip placement="top" content={hoverContent}>
        {tag}
      </LxTooltip>
    )
  }

  // 点击弹层：模式列表（当前基础模式勾选标记，选中即切换并关闭）。
  const menuContent = (
    <div className="flex w-56 flex-col gap-0.5 p-1" role="listbox">
      {COLLABORATION_MODE_ORDER.map((item) => {
        const itemMeta = COLLABORATION_MODE_META[item]
        const isActive = item === mode
        return (
          <LxNavItem
            key={item}
            role="option"
            aria-selected={isActive}
            size="small"
            className={isActive ? "bg-white/10" : ""}
            prefix={<itemMeta.Icon className={`h-3.5 w-3.5 shrink-0 ${itemMeta.iconClass}`} />}
            suffix={isActive ? <Check className="h-3.5 w-3.5 shrink-0 text-white/70" /> : null}
            onClick={() => {
              onModeChange(item)
              setIsMenuOpen(false)
            }}
          >
            <span className="min-w-0 flex-1 truncate">{t(itemMeta.labelKey)}</span>
          </LxNavItem>
        )
      })}
    </div>
  )

  return (
    <LxTooltip
      hover={{ content: hoverContent, placement: "top" }}
      click={{
        content: menuContent,
        placement: "top",
        multiline: true,
        closeOnOutsideClick: true,
        closeOnContentClick: false,
        open: isMenuOpen,
        onOpenChange: setIsMenuOpen,
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isMenuOpen}
        className="shrink-0 cursor-pointer rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
      >
        {tag}
      </button>
    </LxTooltip>
  )
}
