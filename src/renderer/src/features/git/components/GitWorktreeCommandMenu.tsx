import { GitBranch } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import type { GitWorktreeOption } from "@/features/git"
import { useTranslation } from "@/i18n"

// git 工作区选择面板属性。
interface GitWorktreeCommandMenuProps {
  options?: GitWorktreeOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (option: GitWorktreeOption) => void
}

/**
 * 渲染紧贴编辑器光标的 git 工作区选择面板（/gitWorktree 二级面板）。
 * 顶部为默认工作区，其后为其余工作区；当前绑定项带高亮标记。
 */
export const GitWorktreeCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
  onSelect,
}: GitWorktreeCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = options && position ? { position, activeIndex, options } : null

  return (
    <LxCommandPanel
      ariaLabel={t("git.selectWorktree")}
      className="markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-sm shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
      data={panelData}
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.options.map((option, index) => {
            const isActive = index === displayData.activeIndex
            const isCurrent = option.isCurrent

            return (
              <LxCommandPanelItem
                key={`${option.isDefault ? "default" : option.path}`}
                active={isActive}
                className="flex min-h-11 items-center gap-2 px-2 text-xs"
                index={index}
                leading={
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-[4px] ${
                      isCurrent ? "bg-white/10 text-white" : "bg-white/5 text-white/70"
                    }`}
                  >
                    <GitBranch className="h-3 w-3" />
                  </span>
                }
                onSelect={() => onSelect?.(option)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-sm leading-none text-white">{option.name}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs leading-none text-white/45">
                    {option.isDefault ? t("git.defaultWorktree") : option.path}
                  </span>
                  {isCurrent && (
                    <span className="shrink-0 text-xs leading-none text-emerald-400">
                      {t("git.current")}
                    </span>
                  )}
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
