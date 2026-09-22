import { Plus, ScanSearch, X } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import type { DesignSystemTokens } from "@/features/agent/hooks/designSystemStore"
import { useTranslation } from "@/i18n"

export interface FrontDesignDesignSystemPanelProps {
  tokens: DesignSystemTokens
  onChange: (next: Partial<DesignSystemTokens>) => void
  onReset: () => void
  // 是否可执行画布提取（无 HTML 时禁用）。
  canExtract: boolean
  onExtract: () => void
}

/**
 * FrontDesignDesignSystemPanel - 设计系统令牌编辑面板：色板、圆角、字体与风格约定。
 */
export const FrontDesignDesignSystemPanel = ({
  tokens,
  onChange,
  onReset,
  canExtract,
  onExtract,
}: FrontDesignDesignSystemPanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [draftColor, setDraftColor] = useState<string>("")

  const handleAddColor = (): void => {
    const value = draftColor.trim()
    setDraftColor("")
    if (!value || tokens.colors.includes(value)) return
    onChange({ colors: [...tokens.colors, value] })
  }

  const handleRemoveColor = (color: string): void => {
    onChange({ colors: tokens.colors.filter((item) => item !== color) })
  }

  return (
    <div className="design-system-panel flex w-[252px] flex-col gap-2.5 p-2.5">
      {/* 标题与作用说明 */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white/80">
            {t("frontDesign.designSystemTitle")}
          </span>
          {/* 从当前画布计算样式提取色板 / 圆角 / 字体 */}
          <LxIconButton
            size="small"
            disabled={!canExtract}
            onClick={onExtract}
            aria-label={t("frontDesign.designSystemExtract")}
            title={{ content: t("frontDesign.designSystemExtract"), placement: "bottom" }}
          >
            <ScanSearch />
          </LxIconButton>
        </div>
        <span className="text-xs leading-relaxed text-white/40">
          {t("frontDesign.designSystemDesc")}
        </span>
      </div>

      {/* 色板 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-white/50">{t("frontDesign.designSystemColors")}</span>
        {tokens.colors.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tokens.colors.map((color) => (
              <span
                key={color}
                className="flex items-center gap-1 rounded-[4px] border border-white/10 bg-black/25 px-1.5 py-0.5 font-mono text-xs text-white/70"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                  style={{ backgroundColor: color }}
                />
                <span className="max-w-[110px] truncate">{color}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveColor(color)}
                  aria-label={t("frontDesign.designSystemRemoveColor", { color })}
                  className="cursor-pointer text-white/35 transition-colors hover:text-rose-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <LxInput
              size="small"
              value={draftColor}
              placeholder={t("frontDesign.designSystemColorPlaceholder")}
              aria-label={t("frontDesign.designSystemAddColor")}
              onChange={(event) => setDraftColor(event.target.value)}
            />
          </div>
          <LxIconButton
            size="small"
            preset="add"
            disabled={!draftColor.trim()}
            onClick={handleAddColor}
            aria-label={t("frontDesign.designSystemAddColor")}
            title={{ content: t("frontDesign.designSystemAddColor"), placement: "bottom" }}
          >
            <Plus />
          </LxIconButton>
        </div>
      </div>

      {/* 圆角 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-white/50">{t("frontDesign.designSystemRadius")}</span>
        <LxInput
          size="small"
          value={tokens.radius}
          placeholder={t("frontDesign.designSystemRadiusPlaceholder")}
          aria-label={t("frontDesign.designSystemRadius")}
          onChange={(event) => onChange({ radius: event.target.value })}
        />
      </div>

      {/* 字体 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-white/50">{t("frontDesign.designSystemFont")}</span>
        <LxInput
          size="small"
          value={tokens.fontFamily}
          placeholder={t("frontDesign.designSystemFontPlaceholder")}
          aria-label={t("frontDesign.designSystemFont")}
          onChange={(event) => onChange({ fontFamily: event.target.value })}
        />
      </div>

      {/* 风格约定 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-white/50">{t("frontDesign.designSystemNotes")}</span>
        <LxInput
          size="small"
          multiline
          rows={3}
          value={tokens.notes}
          placeholder={t("frontDesign.designSystemNotesPlaceholder")}
          aria-label={t("frontDesign.designSystemNotes")}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </div>

      {/* 清空 */}
      <div className="flex items-center justify-end">
        <LxIconButton
          size="small"
          preset="delete"
          onClick={onReset}
          icon={<X />}
          aria-label={t("frontDesign.designSystemReset")}
          title={{ content: t("frontDesign.designSystemReset"), placement: "bottom" }}
        >
          <span className="text-xs">{t("frontDesign.designSystemReset")}</span>
        </LxIconButton>
      </div>
    </div>
  )
}
