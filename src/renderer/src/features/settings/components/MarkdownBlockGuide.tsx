import { FileText, type LucideIcon, ScrollText, SquarePlus } from "lucide-react"
import { useState } from "react"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { type TranslationKey, useTranslation } from "@/i18n"

// 模板块类型：任务块 / 临时块 / 记录块。
type MarkdownBlockKind = "template" | "supple" | "log"

interface MarkdownBlockGuideItem {
  kind: MarkdownBlockKind
  icon: LucideIcon
  symbol: string
  nameKey: TranslationKey
  scopeKey: TranslationKey
  descKey: TranslationKey
  exampleKey: TranslationKey
}

const BLOCK_GUIDES: MarkdownBlockGuideItem[] = [
  {
    kind: "template",
    icon: FileText,
    symbol: "&&&",
    nameKey: "settings.customCommandBlockTemplateName",
    scopeKey: "settings.customCommandBlockTemplateScope",
    descKey: "settings.customCommandBlockTemplateDesc",
    exampleKey: "settings.customCommandBlockTemplateExample",
  },
  {
    kind: "supple",
    icon: SquarePlus,
    symbol: "+++",
    nameKey: "settings.customCommandBlockSuppleName",
    scopeKey: "settings.customCommandBlockSubblockScope",
    descKey: "settings.customCommandBlockSuppleDesc",
    exampleKey: "settings.customCommandBlockSuppleExample",
  },
  {
    kind: "log",
    icon: ScrollText,
    symbol: "%%%",
    nameKey: "settings.customCommandBlockLogName",
    scopeKey: "settings.customCommandBlockSubblockScope",
    descKey: "settings.customCommandBlockLogDesc",
    exampleKey: "settings.customCommandBlockLogExample",
  },
]

/**
 * 渲染 md 模板块说明视图：左侧固定三项块类型列表，右侧展示语法、作用域与示例。
 */
export const MarkdownBlockGuide = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [selectedKind, setSelectedKind] = useState<MarkdownBlockKind>("template")
  const selected = BLOCK_GUIDES.find((guide) => guide.kind === selectedKind) ?? BLOCK_GUIDES[0]

  return (
    <div className="custom-scrollbar grid min-h-0 flex-1 gap-3 overflow-y-auto @[560px]:overflow-hidden @[560px]:grid-cols-[220px_minmax(0,1fr)]">
      <nav
        className="flex min-h-0 flex-col border-r border-white/8 pr-2"
        aria-label={t("settings.customCommandBlocksList")}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {BLOCK_GUIDES.map(({ kind, icon: Icon, symbol, nameKey }) => {
            const isSelected = kind === selectedKind
            return (
              <LxNavItem
                key={kind}
                level={2}
                className={`w-full ${isSelected ? "bg-white/5 text-white" : "text-white/70"}`}
                aria-current={isSelected ? "true" : undefined}
                onClick={() => setSelectedKind(kind)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-white/45" />
                <span className="min-w-0 flex-1 truncate select-none">{t(nameKey)}</span>
                <span className="shrink-0 font-mono text-xs text-white/40">{symbol}</span>
              </LxNavItem>
            )
          })}
        </div>
      </nav>

      <div className="custom-scrollbar min-h-0 overflow-y-auto pr-1">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-white">{t(selected.nameKey)}</h3>
            <span className="rounded-[4px] bg-white/8 px-1.5 py-0.5 font-mono text-xs text-white/60">
              {selected.symbol}
            </span>
            <span className="rounded-[4px] border border-white/10 px-1.5 py-0.5 text-xs text-white/50">
              {t(selected.scopeKey)}
            </span>
          </div>

          <p className="text-xs text-white/60 leading-relaxed">{t(selected.descKey)}</p>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/70">
              {t("settings.customCommandBlockSyntaxTitle")}
            </span>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-white/55">
              <li>{t("settings.customCommandBlockSyntaxStartEnd")}</li>
              <li>{t("settings.customCommandBlockSyntaxTitleField")}</li>
              <li>{t("settings.customCommandBlockSyntaxId")}</li>
              <li>{t("settings.customCommandBlockSyntaxWt")}</li>
              {selected.kind !== "template" ? (
                <li>{t("settings.customCommandBlockSyntaxNested")}</li>
              ) : null}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-white/70">
              {t("settings.customCommandBlockExampleTitle")}
            </span>
            <pre className="overflow-x-auto rounded-[6px] border border-white/8 bg-black/30 p-3 font-mono text-xs text-white/70 leading-relaxed">
              {t(selected.exampleKey)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}
