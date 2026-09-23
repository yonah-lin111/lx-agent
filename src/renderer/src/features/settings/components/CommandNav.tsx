import type { CustomCommandDetailItem } from "@shared/contracts/customCommand"
import { Plus, Trash2 } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"

interface CommandNavProps {
  commands: CustomCommandDetailItem[]
  selectedCommandName: string | null
  isEditingDraft: boolean
  hasDraft: boolean
  draftName: string
  isLoading: boolean
  // 列表无障碍标签、空态文案与底部新建入口文案（命令 / 模板块两种场景）。
  listLabel: string
  emptyLabel: string
  addLabel: string
  isCommandModified: (name: string) => boolean
  onSelectCommand: (name: string) => void
  onSelectDraft: () => void
  onDeleteDraft: () => void
  onStartCreate: () => void
  onOpenContextMenu: (commandName: string, x: number, y: number, anchor: HTMLElement | null) => void
}

/**
 * 渲染自定义命令左侧导航列表（与模型 Provider 导航同构：无卡片、右侧分隔线、底部添加入口）。
 */
export const CommandNav = ({
  commands,
  selectedCommandName,
  isEditingDraft,
  hasDraft,
  draftName,
  isLoading,
  listLabel,
  emptyLabel,
  addLabel,
  isCommandModified,
  onSelectCommand,
  onSelectDraft,
  onDeleteDraft,
  onStartCreate,
  onOpenContextMenu,
}: CommandNavProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isEmpty = commands.length === 0 && !hasDraft

  return (
    <nav className="flex min-h-0 flex-col border-r border-white/8 pr-2" aria-label={listLabel}>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {isLoading ? (
          <div className="py-4 text-center text-xs text-white/40">{t("common.loading")}</div>
        ) : isEmpty ? (
          <div className="py-6 text-center text-xs text-white/40">{emptyLabel}</div>
        ) : (
          <>
            {/* 草稿项：只要 hasDraft 存在就常驻列表，不随查看其它命令而消失 */}
            {hasDraft && (
              <LxNavItem
                level={2}
                className={`group w-full ${
                  isEditingDraft ? "bg-white/5 text-white" : "text-emerald-400"
                }`}
                aria-current={isEditingDraft ? "true" : undefined}
                onClick={onSelectDraft}
              >
                <span className="min-w-0 flex-1 truncate italic select-none">
                  {draftName.trim() || t("settings.newCustomCommandDraft")}
                </span>
                <LxTag size="small" bgClass="bg-emerald-500/20 text-emerald-300">
                  Draft
                </LxTag>
                <LxIconButton
                  variant="ghost"
                  showHoverBg={false}
                  aria-label={t("common.delete")}
                  hoverTextClass="hover:text-rose-400"
                  className="opacity-0 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteDraft()
                  }}
                >
                  <Trash2 />
                </LxIconButton>
              </LxNavItem>
            )}

            {commands.map((command) => {
              const isSelected = !isEditingDraft && command.name === selectedCommandName
              return (
                <LxNavItem
                  key={command.name}
                  level={2}
                  className={`w-full ${isSelected ? "bg-white/5 text-white" : "text-white/70"}`}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => onSelectCommand(command.name)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    onOpenContextMenu(
                      command.name,
                      event.clientX,
                      event.clientY,
                      event.currentTarget as HTMLElement,
                    )
                  }}
                >
                  <span className="shrink-0 text-white/40 font-mono select-none">/</span>
                  <span className="min-w-0 flex-1 truncate font-mono select-none">
                    {command.name}
                  </span>
                  {isCommandModified(command.name) && (
                    <span
                      aria-label="Modified"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                    />
                  )}
                </LxNavItem>
              )
            })}
          </>
        )}
      </div>

      <div className="shrink-0 pt-1">
        <LxNavItem
          level={2}
          className="w-full text-white/70"
          aria-label={addLabel}
          onClick={onStartCreate}
          prefix={<Plus className="h-3.5 w-3.5 shrink-0 text-white/45" />}
        >
          <span className="min-w-0 flex-1 truncate select-none">{addLabel}</span>
        </LxNavItem>
      </div>
    </nav>
  )
}
