import {
  MCP_PRESETS,
  type McpPresetDefinition,
  type McpPresetId,
  type McpPresetStatusItem,
} from "@shared/mcpPresets"
import type { McpServerConfig } from "@shared/settings"
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Copy,
  Download,
  Github,
  Loader2,
  Network,
  XCircle,
} from "lucide-react"
import type React from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { type TranslationKey, useTranslation } from "@/i18n"

// 预设卡片图标映射。
const PRESET_ICONS: Record<McpPresetId, typeof BookOpen> = {
  context7: BookOpen,
  codegraph: Network,
  "codebase-memory-mcp": Brain,
}

// 预设描述多语言 key 映射。
const PRESET_DESCRIPTION_KEYS: Record<McpPresetId, TranslationKey> = {
  context7: "settings.mcpPresetContext7Desc",
  codegraph: "settings.mcpPresetCodegraphDesc",
  "codebase-memory-mcp": "settings.mcpPresetCodebaseMemoryDesc",
}

// 预设区属性。
export interface McpPresetSectionProps {
  // 预设二进制探测状态。
  statuses: McpPresetStatusItem[]
  // 当前 MCP 配置（用于判断预设是否已添加）。
  servers: Record<string, McpServerConfig>
  // 顶部搜索关键字（与服务器列表共用）。
  searchQuery: string
  // 正在安装的预设 id。
  installingId: McpPresetId | null
  // 启用预设：写入配置草稿。
  onAdd: (preset: McpPresetDefinition) => void
  // 安装预设：执行全局安装命令。
  onInstall: (preset: McpPresetDefinition) => void
  // 复制预设安装命令。
  onCopyCommand: (preset: McpPresetDefinition) => void
  // 打开预设官网。
  onOpenHomepage: (url: string) => void
}

/**
 * 渲染"未添加到配置"的 MCP 预设推荐区；全部已添加或无匹配时隐藏。
 */
export const McpPresetSection = ({
  statuses,
  servers,
  searchQuery,
  installingId,
  onAdd,
  onInstall,
  onCopyCommand,
  onOpenHomepage,
}: McpPresetSectionProps): React.JSX.Element | null => {
  const { t } = useTranslation()

  const query = searchQuery.toLowerCase().trim()
  const visiblePresets = MCP_PRESETS.filter((preset) => {
    if (servers[preset.id]) return false
    if (!query) return true
    return (
      preset.id.toLowerCase().includes(query) ||
      preset.displayName.toLowerCase().includes(query) ||
      t(PRESET_DESCRIPTION_KEYS[preset.id]).toLowerCase().includes(query)
    )
  })

  if (visiblePresets.length === 0) return null

  const statusMap = new Map(statuses.map((item) => [item.id, item]))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-white/45">{t("settings.mcpPresetsTitle")}</span>

      <div className="grid grid-cols-1 gap-2.5">
        {visiblePresets.map((preset) => {
          const status = statusMap.get(preset.id)
          const installed = status?.installed ?? false
          const installing = installingId === preset.id
          const canAutoInstall = preset.installKind === "npm-global"
          const PresetIcon = PRESET_ICONS[preset.id]
          const checkboxId = `mcp-preset-enable-${preset.id}`
          const enableTooltip = installed
            ? undefined
            : canAutoInstall
              ? t("settings.mcpPresetNeedsInstall")
              : t("settings.mcpPresetNeedsNode")

          return (
            <div
              key={preset.id}
              className="settings-item-card group relative flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
            >
              {/* 标题栏：身份、安装状态与操作 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05] text-white/80">
                    <PresetIcon className="h-4 w-4" />
                  </div>
                  <span className="truncate text-xs font-semibold text-white/90">
                    {preset.displayName}
                  </span>
                  <LxTag size="small" color="indigo">
                    {t("settings.mcpPresetBadge")}
                  </LxTag>
                  {installed ? (
                    <LxTag
                      size="small"
                      color="emerald"
                      prefix={<CheckCircle2 className="h-3 w-3" />}
                    >
                      {t("settings.mcpPresetInstalled")}
                    </LxTag>
                  ) : (
                    <LxTag size="small" color="gray" prefix={<XCircle className="h-3 w-3" />}>
                      {t("settings.mcpPresetNotInstalled")}
                    </LxTag>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <LxIconButton
                    preset="default"
                    aria-label={`${t("settings.mcpPresetHomepage")} ${preset.displayName}`}
                    title={{
                      content: t("settings.mcpPresetHomepage"),
                      placement: "top",
                    }}
                    onClick={() => onOpenHomepage(preset.homepage)}
                  >
                    <Github className="text-white/60" />
                  </LxIconButton>

                  {preset.installCommand && (
                    <LxIconButton
                      preset="default"
                      aria-label={`${t("settings.mcpPresetCopyInstallCommand")} ${preset.displayName}`}
                      title={{
                        content: t("settings.mcpPresetCopyInstallCommand"),
                        placement: "top",
                      }}
                      onClick={() => onCopyCommand(preset)}
                    >
                      <Copy className="text-white/60" />
                    </LxIconButton>
                  )}

                  {!installed && canAutoInstall && (
                    <LxIconButton
                      iconOnly={false}
                      disabled={installing}
                      aria-label={`${t("settings.mcpPresetInstall")} ${preset.displayName}`}
                      onClick={() => onInstall(preset)}
                      textClass="text-white/70"
                      hoverBgClass="hover:bg-white/[0.08]"
                      className="border border-white/10 bg-white/[0.03] px-2 font-medium cursor-pointer hover:border-white/20"
                      icon={installing ? <Loader2 className="animate-spin" /> : <Download />}
                    >
                      <span>
                        {installing
                          ? t("settings.mcpPresetInstalling")
                          : t("settings.mcpPresetInstall")}
                      </span>
                    </LxIconButton>
                  )}

                  <div className="h-3.5 w-px bg-white/10" />

                  <LxTooltip content={enableTooltip} placement="top">
                    <div className="flex items-center gap-1.5">
                      <LxCheckbox
                        id={checkboxId}
                        checked={false}
                        disabled={!installed}
                        aria-label={`${t("settings.mcpPresetEnable")} ${preset.displayName}`}
                        onChange={() => onAdd(preset)}
                      />
                      <label
                        htmlFor={checkboxId}
                        className={`select-none whitespace-nowrap text-xs ${
                          !installed
                            ? "cursor-not-allowed text-white/25"
                            : "cursor-pointer text-white/60 hover:text-white"
                        }`}
                      >
                        {t("settings.mcpPresetEnable")}
                      </label>
                    </div>
                  </LxTooltip>
                </div>
              </div>

              {/* 描述 */}
              <p className="text-xs text-white/50 leading-relaxed">
                {t(PRESET_DESCRIPTION_KEYS[preset.id])}
              </p>

              {/* 启动命令与探测路径 */}
              <div className="flex flex-col gap-1 text-xs text-white/60">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="shrink-0 text-white/40">{t("settings.mcpCommand")}:</span>
                  <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-white/80 select-all">
                    {preset.command.join(" ")}
                  </code>
                </div>
                {status?.detectedPath && (
                  <p className="truncate font-mono text-xs text-white/35">{status.detectedPath}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
