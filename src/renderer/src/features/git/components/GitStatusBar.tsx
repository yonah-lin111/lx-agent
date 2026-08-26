import type { Project } from "@shared/project"
import { Check, Folder, GitBranch, GitFork, Search } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxInput } from "@/components/ui/LxInput"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import { gitApi } from "@/features/git/api/gitApi"
import { useGitWorktrees } from "@/features/git/hooks/useGitWorktrees"
import { getGitWorktreeDirName } from "@/features/git/utils"
import { projectApi } from "@/features/project/api/projectApi"
import { useTranslation } from "@/i18n"

// 状态栏属性。
export interface GitStatusBarProps {
  // 当前项目文件系统路径；缺省时不渲染状态栏。
  projectPath?: string
  // 容器类名。
  className?: string
  // 当前绑定的项目 ID（交互模式下高亮选中的项目）。
  projectId?: string
  // 路径切换提示目标（新会话切换页面/项目时触发）。
  pathPrompt?: { projectId?: string; projectPath: string; projectName?: string } | null
  // 确认切换路径回调。
  onAcceptPathPrompt?: () => void
  // 取消切换路径回调。
  onDismissPathPrompt?: () => void
  // 是否启用交互模式（支持点击弹出菜单切换项目、分支与工作区）。默认 false。
  interactive?: boolean
  // 是否始终展示工作区（缺省时展示 'none'）。默认 false。
  alwaysShowWorktree?: boolean
  // 切换项目回调。
  onProjectChange?: (projectId: string, projectPath: string) => void
  // 切换分支回调。
  onBranchChange?: (branch: string) => void
  // 切换工作区回调。
  onWorktreeChange?: (worktreePath: string) => void
}

/**
 * 渲染项目名、git 分支与工作区；非 git 目录仅显示项目名。
 *
 * 交互模式下支持点击弹出 LxTooltip 选择切换项目、本地分支与工作区。
 * 每个 Tooltip 包含固定的搜索框与标题，不随列表滚动；点击内容区不关闭，选择条目后关闭。
 * 非交互模式下保持只读展示（MarkdownStatusBar 使用）。
 */
export const GitStatusBar = ({
  projectPath,
  className = "flex min-w-0 items-center gap-2 border-t border-white/5 py-1 text-xs text-white/50",
  projectId,
  pathPrompt,
  onAcceptPathPrompt,
  onDismissPathPrompt,
  interactive = false,
  alwaysShowWorktree = false,
  onProjectChange,
  onBranchChange,
  onWorktreeChange,
}: GitStatusBarProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const { success, error } = useLxToast()
  const { worktrees, projectBranch, reload } = useGitWorktrees(projectPath)
  const [projects, setProjects] = useState<Project[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [defaultDesktopPath, setDefaultDesktopPath] = useState<string>("")

  // Tooltip 开关状态
  const [isPathPromptOpen, setIsPathPromptOpen] = useState(false)
  const [isProjectSelectOpen, setIsProjectSelectOpen] = useState(false)
  const [isBranchSelectOpen, setIsBranchSelectOpen] = useState(false)
  const [isWorktreeSelectOpen, setIsWorktreeSelectOpen] = useState(false)

  // 当外部传入新 pathPrompt 时自动展开切换提示气泡并关闭选择菜单
  useEffect(() => {
    if (pathPrompt) {
      setIsProjectSelectOpen(false)
      setIsPathPromptOpen(true)
    } else {
      setIsPathPromptOpen(false)
    }
  }, [pathPrompt])

  // 搜索关键字状态
  const [projectQuery, setProjectQuery] = useState("")
  const [branchQuery, setBranchQuery] = useState("")
  const [worktreeQuery, setWorktreeQuery] = useState("")

  // 加载有路径的项目列表
  const loadProjects = useCallback((): void => {
    if (!interactive) return
    void Promise.all([projectApi.listProjects(), agentApi.getDefaultPath()]).then(
      ([list, desktop]) => {
        setDefaultDesktopPath(desktop)
        const validProjects = list.filter((p) => Boolean(p.path))
        const hasDesktop = Boolean(desktop) && validProjects.some((p) => p.path === desktop)
        if (!hasDesktop && desktop) {
          const desktopProject: Project = {
            id: "",
            name: t("git.desktopProject"),
            type: "filesystem",
            path: desktop,
            referencedFolders: [],
            createdAt: "",
            updatedAt: "",
          }
          setProjects([desktopProject, ...validProjects])
        } else {
          setProjects(validProjects)
        }
      },
    )
  }, [interactive, t])

  // 加载本地分支列表
  const loadBranches = useCallback((): void => {
    if (!interactive || !projectPath) return
    void gitApi.listBranches(projectPath).then((list) => {
      setBranches(list ?? [])
    })
  }, [interactive, projectPath])

  useEffect(() => {
    if (interactive) {
      loadProjects()
      loadBranches()
    }
  }, [interactive, projectPath, loadProjects, loadBranches])

  const currentProject = projects.find(
    (p) => (projectId && p.id === projectId) || (projectPath && p.path === projectPath),
  )
  const isCurrentPathDesktop = Boolean(
    defaultDesktopPath &&
      (projectPath === defaultDesktopPath || (!projectId && !projectPath && defaultDesktopPath)),
  )
  const defaultEntry = (worktrees ?? []).find((entry) => entry.isDefault)
  const projectName = projectPath
    ? defaultEntry
      ? getGitWorktreeDirName(defaultEntry.path)
      : projectPath === defaultDesktopPath
        ? t("git.desktopProject")
        : getGitWorktreeDirName(projectPath)
    : (currentProject?.name ?? t("git.switchProject"))

  // 当前目录所在的工作区：精确命中优先；仓库内子目录（含 .worktrees 内部）取最长路径前缀命中。
  const currentEntry = (worktrees ?? [])
    .filter(
      (entry) =>
        Boolean(projectPath) &&
        (entry.path === projectPath || (projectPath ? projectPath.startsWith(`${entry.path}/`) : false)),
    )
    .sort((a, b) => b.path.length - a.path.length)[0]
  const worktreeName =
    currentEntry && !currentEntry.isDefault ? getGitWorktreeDirName(currentEntry.path) : undefined

  // 分支名恒取主工作区（仓库根）分支。
  const mainBranch = defaultEntry?.branch ?? projectBranch

  // 搜索过滤后的项目列表
  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.path && p.path.toLowerCase().includes(q)),
    )
  }, [projects, projectQuery])

  // 搜索过滤后的分支列表
  const filteredBranches = useMemo(() => {
    const q = branchQuery.trim().toLowerCase()
    if (!q) return branches
    return branches.filter((b) => b.toLowerCase().includes(q))
  }, [branches, branchQuery])

  // 搜索过滤后的工作区列表
  const filteredWorktrees = useMemo(() => {
    const q = worktreeQuery.trim().toLowerCase()
    const list = worktrees ?? []
    if (!q) return list
    return list.filter((wt) => {
      const name = wt.isDefault ? t("git.defaultWorktree") : getGitWorktreeDirName(wt.path)
      return name.toLowerCase().includes(q) || wt.path.toLowerCase().includes(q)
    })
  }, [worktrees, worktreeQuery, t])

  if (!interactive && !projectPath) return null

  // 分支切换处理
  const handleBranchSelect = async (targetBranch: string): Promise<void> => {
    if (!projectPath || targetBranch === mainBranch) return
    const result = await gitApi.checkoutBranch(projectPath, targetBranch)
    if (result.ok) {
      success(t("git.branchSwitched", { branch: targetBranch }))
      reload()
      loadBranches()
      onBranchChange?.(targetBranch)
    } else {
      error(result.error ?? "切换分支失败")
    }
  }

  // 渲染项目部分
  const renderProjectItem = (): React.JSX.Element => {
    if (!interactive) {
      return (
        <LxTooltip content={projectPath} placement="top">
          <span className="git-status-item flex min-w-0 items-center gap-1">
            <Folder
              className={`h-3.5 w-3.5 shrink-0 ${
                isCurrentPathDesktop ? "text-violet-400" : "text-sky-400"
              }`}
            />
            <span
              className={`truncate ${isCurrentPathDesktop ? "text-violet-300 font-medium" : ""}`}
            >
              {projectName}
            </span>
          </span>
        </LxTooltip>
      )
    }

    const isShowingPrompt = Boolean(isPathPromptOpen && pathPrompt)

    const targetName =
      pathPrompt?.projectName ||
      projects.find(
        (p) =>
          (pathPrompt?.projectId && p.id === pathPrompt.projectId) ||
          p.path === pathPrompt?.projectPath,
      )?.name ||
      (defaultDesktopPath && pathPrompt?.projectPath === defaultDesktopPath
        ? t("git.desktopProject")
        : pathPrompt?.projectPath
          ? getGitWorktreeDirName(pathPrompt.projectPath)
          : "")

    const promptTooltipContent = (
      <div className="flex max-w-[280px] flex-col gap-2 p-1">
        <p className="text-xs text-white/80 leading-relaxed break-words whitespace-normal">
          {t("git.switchDirectoryPrompt", { name: targetName })}
        </p>
        <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-white/5">
          <button
            type="button"
            className="cursor-pointer rounded-[4px] px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => {
              setIsPathPromptOpen(false)
              onDismissPathPrompt?.()
            }}
          >
            {t("git.keepCurrent")}
          </button>
          <button
            type="button"
            className="cursor-pointer rounded-[4px] bg-sky-500/20 px-2 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/30 transition-colors"
            onClick={() => {
              setIsPathPromptOpen(false)
              onAcceptPathPrompt?.()
            }}
          >
            {t("git.confirmSwitch")}
          </button>
        </div>
      </div>
    )

    const projectTooltipContent = (
      <div className="flex w-64 flex-col">
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-white/5 p-2">
          <div className="text-[11px] font-medium text-white/40">
            {t("git.switchProject")}
          </div>
          <LxInput
            size="xs"
            placeholder={t("git.searchProjects")}
            prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
          />
        </div>
        <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto p-1">
          {filteredProjects.length === 0 ? (
            <div className="px-2 py-2 text-center text-xs text-white/40">
              {projectQuery ? t("git.noMatchingProjects") : t("project.noProjects")}
            </div>
          ) : (
            filteredProjects.map((p) => {
              const isDesktop =
                Boolean(defaultDesktopPath && p.path === defaultDesktopPath) ||
                p.name === "Desktop" ||
                p.name === "桌面"
              const isCurrent =
                (p.id ? p.id === projectId : !projectId && isDesktop) ||
                (Boolean(p.path) && p.path === projectPath)
              return (
                <button
                  key={p.id || p.path || "desktop"}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
                    isCurrent ? "bg-white/8 text-white font-medium" : "text-white/70"
                  }`}
                  onClick={() => {
                    if (p.path && onProjectChange) {
                      onProjectChange(p.id, p.path)
                    }
                    setIsProjectSelectOpen(false)
                  }}
                >
                  <Folder
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isDesktop ? "text-violet-400" : "text-sky-400"
                    }`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`truncate ${
                        isDesktop ? "text-violet-300 font-medium" : "text-white"
                      }`}
                    >
                      {p.name}
                    </span>
                    <span className="truncate text-[10px] text-white/40">{p.path}</span>
                  </div>
                  {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    )

    const isOpen = isShowingPrompt || isProjectSelectOpen

    return (
      <LxTooltip
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            if (!isShowingPrompt) {
              setProjectQuery("")
              loadProjects()
              setIsProjectSelectOpen(true)
            }
          } else {
            if (isShowingPrompt) {
              setIsPathPromptOpen(false)
              onDismissPathPrompt?.()
            }
            setIsProjectSelectOpen(false)
          }
        }}
        trigger="click"
        placement="top"
        multiline={true}
        minimizable={isShowingPrompt}
        closeOnScroll={false}
        closeOnOutsideClick={true}
        closeOnContentClick={false}
        title={
          isShowingPrompt ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              <span className="shrink-0 text-[13px] font-medium text-white/90">
                {t("git.switchDirectoryTitle")}
              </span>
            </span>
          ) : undefined
        }
        content={isShowingPrompt ? promptTooltipContent : projectTooltipContent}
      >
        <button
          type="button"
          className="git-status-item flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-white/10"
        >
          <Folder
            className={`h-3.5 w-3.5 shrink-0 ${
              isCurrentPathDesktop ? "text-violet-400" : "text-sky-400"
            }`}
          />
          <span
            className={`truncate ${isCurrentPathDesktop ? "text-violet-300 font-medium" : ""}`}
          >
            {projectName}
          </span>
        </button>
      </LxTooltip>
    )
  }

  // 渲染分支部分
  const renderBranchItem = (): React.JSX.Element | null => {
    const shouldShow = interactive || (Boolean(projectPath) && Boolean(mainBranch))
    if (!shouldShow) return null

    const displayBranch = mainBranch ?? "none"

    if (!interactive) {
      if (!mainBranch) return null
      return (
        <LxTooltip content={t("git.currentBranch", { branch: displayBranch })} placement="top">
          <span className="git-status-item flex shrink-0 items-center gap-1 text-white/70">
            <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
            {displayBranch}
          </span>
        </LxTooltip>
      )
    }

    const branchTooltipContent = (
      <div className="flex w-56 flex-col">
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-white/5 p-2">
          <div className="text-[11px] font-medium text-white/40">
            {t("git.switchBranch")}
          </div>
          <LxInput
            size="xs"
            placeholder={t("git.searchBranches")}
            prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
            value={branchQuery}
            onChange={(e) => setBranchQuery(e.target.value)}
          />
        </div>
        <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto p-1">
          {filteredBranches.length === 0 ? (
            <div className="px-2 py-2 text-center text-xs text-white/40">
              {branchQuery ? t("git.noMatchingBranches") : t("git.noBranch")}
            </div>
          ) : (
            filteredBranches.map((b) => {
              const isCurrent = b === mainBranch
              return (
                <button
                  key={b}
                  type="button"
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
                    isCurrent ? "bg-white/8 text-white font-medium" : "text-white/70"
                  }`}
                  onClick={() => {
                    void handleBranchSelect(b)
                    setIsBranchSelectOpen(false)
                  }}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="truncate">{b}</span>
                  </span>
                  {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    )

    return (
      <LxTooltip
        open={isBranchSelectOpen}
        onOpenChange={(open) => {
          setIsBranchSelectOpen(open)
          if (open) {
            setBranchQuery("")
            loadBranches()
          }
        }}
        trigger="click"
        placement="top"
        multiline={true}
        closeOnOutsideClick={true}
        closeOnContentClick={false}
        content={branchTooltipContent}
      >
        <button
          type="button"
          className="git-status-item flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-white/70 transition-colors hover:bg-white/10"
        >
          <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
          <span>{displayBranch}</span>
        </button>
      </LxTooltip>
    )
  }

  // 渲染工作区部分
  const renderWorktreeItem = (): React.JSX.Element | null => {
    const shouldShow =
      interactive || alwaysShowWorktree || (Boolean(projectPath) && Boolean(worktreeName))
    if (!shouldShow) return null

    const displayWorktree = worktreeName ?? "none"

    if (!interactive) {
      if (!worktreeName) return null
      return (
        <LxTooltip content={t("git.worktree", { name: worktreeName })} placement="top">
          <span className="git-status-item flex shrink-0 items-center gap-1 text-white/70">
            <GitFork className="h-3.5 w-3.5 text-amber-400" />
            {worktreeName}
          </span>
        </LxTooltip>
      )
    }

    const worktreeTooltipContent = (
      <div className="flex w-64 flex-col">
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-white/5 p-2">
          <div className="text-[11px] font-medium text-white/40">
            {t("git.switchWorktree")}
          </div>
          <LxInput
            size="xs"
            placeholder={t("git.searchWorktrees")}
            prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
            value={worktreeQuery}
            onChange={(e) => setWorktreeQuery(e.target.value)}
          />
        </div>
        <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto p-1">
          {filteredWorktrees.length === 0 ? (
            <div className="px-2 py-2 text-center text-xs text-white/40">
              {worktreeQuery ? t("git.noMatchingWorktrees") : t("git.noWorktree")}
            </div>
          ) : (
            filteredWorktrees.map((wt) => {
              const isCurrent = wt.path === currentEntry?.path || (wt.isDefault && !currentEntry)
              const name = wt.isDefault
                ? t("git.defaultWorktree")
                : getGitWorktreeDirName(wt.path)
              return (
                <button
                  key={wt.path}
                  type="button"
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-white/10 ${
                    isCurrent ? "bg-white/8 text-white font-medium" : "text-white/70"
                  }`}
                  onClick={() => {
                    onWorktreeChange?.(wt.path)
                    setIsWorktreeSelectOpen(false)
                  }}
                >
                  <GitFork className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-white">{name}</span>
                    <span className="truncate text-[10px] text-white/40">{wt.path}</span>
                  </div>
                  {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    )

    return (
      <LxTooltip
        open={isWorktreeSelectOpen}
        onOpenChange={(open) => {
          setIsWorktreeSelectOpen(open)
          if (open) {
            setWorktreeQuery("")
            reload()
          }
        }}
        trigger="click"
        placement="top"
        multiline={true}
        closeOnOutsideClick={true}
        closeOnContentClick={false}
        content={worktreeTooltipContent}
      >
        <button
          type="button"
          className="git-status-item flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-white/70 transition-colors hover:bg-white/10"
        >
          <GitFork className="h-3.5 w-3.5 text-amber-400" />
          <span>{displayWorktree}</span>
        </button>
      </LxTooltip>
    )
  }

  return (
    <div className={`git-status-bar ${className}`}>
      {renderProjectItem()}
      {renderBranchItem()}
      {renderWorktreeItem()}
    </div>
  )
}
