import type { SkillItem } from "@shared/contracts/agent"
import type { ProjectFileEntry } from "@shared/project"
import {
  Bot,
  Cpu,
  FileText,
  Folder,
  History,
  MessageSquare,
  Palette,
  Sparkles,
  SquareSlash,
  UserCog,
} from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"
import { getMentionDirectoryTag } from "@/features/project/utils"
import { useTranslation } from "@/i18n"

export interface AgentInputCommand {
  id: string
  name: string
  description: string
  kind?: "builtin" | "prompt" | "skill"
  source?: "project" | "user"
  argumentHint?: string
}

export interface AgentInputModel {
  id: string
  label: string
  provider: string
}

export interface AgentInputProjectItem {
  id: string
  name: string
  path: string
  isDesktop?: boolean
  isCurrent?: boolean
}

export interface AgentInputSessionItem {
  id: string
  title: string
  cwd: string
  updatedAt: string
  isCurrent?: boolean
}

type AgentPanelKind = "command" | "file"

interface AgentInputModelPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  models: AgentInputModel[]
  activeIndex: number
  onSelect?: (model: AgentInputModel) => void
}

export interface AgentInputProjectPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  projects: AgentInputProjectItem[]
  activeIndex: number
  onSelect?: (project: AgentInputProjectItem) => void
}

export interface AgentInputSessionPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  sessions: AgentInputSessionItem[]
  activeIndex: number
  onSelect?: (session: AgentInputSessionItem) => void
}

interface AgentInputCommandPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  commands: AgentInputCommand[]
  activeIndex: number
  onSelect?: (command: AgentInputCommand) => void
}

// 历史提示词条目（新→旧）。
export interface AgentHistoryPromptItem {
  id: string
  text: string
}

export interface AgentInputHistoryPromptPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  prompts: AgentHistoryPromptItem[]
  activeIndex: number
  onSelect?: (item: AgentHistoryPromptItem) => void
}

export const panelClassName =
  "scrollbar-hidden pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-sm shadow-[0_10px_28px_rgba(0,0,0,0.45)]"

// 命令类型对应的左侧图标与底色。
const commandKindStyles = {
  builtin: { icon: SquareSlash, className: "bg-white/5 text-white/70" },
  prompt: { icon: FileText, className: "bg-amber-500/20 text-amber-300" },
  skill: { icon: Sparkles, className: "bg-[#7c3aed]/20 text-[#c084fc]" },
} as const

/**
 * 读取 CSS 变量中的尺寸（支持 px/rem/vh/vw）换算为像素。
 */
const getCssDimensionInPixels = (variableName: string): number => {
  const cssValue = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim()
  const value = Number.parseFloat(cssValue)
  if (!Number.isFinite(value)) return 0

  if (cssValue.endsWith("rem")) {
    return value * Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  }
  if (cssValue.endsWith("vh")) return (value / 100) * window.innerHeight
  if (cssValue.endsWith("vw")) return (value / 100) * window.innerWidth

  return value
}

/**
 * 根据输入框容器位置计算面板在视口内的位置：下方空间不足时向上翻转，
 * 空间都不足时收窄最大高度，保证面板完整可见。
 */
export const getAgentPanelPosition = (kind: AgentPanelKind, rect: DOMRect): CSSProperties => {
  const maxHeight = getCssDimensionInPixels(
    kind === "file"
      ? "--agent-input-file-menu-max-height"
      : "--agent-input-command-menu-max-height",
  )
  const offset = 6
  const left = Math.min(Math.max(rect.left, 8), Math.max(window.innerWidth - rect.width - 8, 8))
  const horizontal = { left, width: rect.width }

  const spaceBelow = window.innerHeight - rect.bottom
  if (spaceBelow >= maxHeight) {
    return { ...horizontal, maxHeight, top: rect.bottom + offset, bottom: "auto" }
  }

  const aboveMaxHeight = Math.min(maxHeight, Math.max(rect.top - offset - 8, 0))
  if (aboveMaxHeight > 0) {
    return {
      ...horizontal,
      maxHeight: aboveMaxHeight,
      top: "auto",
      bottom: window.innerHeight - rect.top + offset,
    }
  }

  return {
    ...horizontal,
    maxHeight: Math.max(spaceBelow - offset - 8, 0),
    top: rect.bottom + offset,
    bottom: "auto",
  }
}

const formatSessionTime = (dateStr?: string, justNowText = "Just now"): string => {
  if (!dateStr) return ""
  const time = new Date(dateStr).getTime()
  if (Number.isNaN(time)) return ""
  const diff = Date.now() - time
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return justNowText
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(time).toLocaleDateString()
}

/**
 * 渲染 Agent 输入框的模型选择面板。
 */
export const AgentInputModelPanel = ({
  isOpen,
  position,
  models,
  activeIndex,
  onSelect,
}: AgentInputModelPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && models.length > 0 ? { position, activeIndex, models } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.modelSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.models.map((model, index) => (
            <LxCommandPanelItem
              key={model.id}
              active={index === displayData.activeIndex}
              className="flex h-11 items-center gap-3 px-2 text-xs"
              index={index}
              leading={<Cpu className="h-3.5 w-3.5 shrink-0 text-teal-300/60" />}
              onSelect={() => onSelect?.(model)}
            >
              <span className="truncate font-medium">{model.label}</span>
              <span className="ml-auto shrink-0 text-white/35">{model.provider}</span>
            </LxCommandPanelItem>
          ))}
        </>
      )}
    </LxCommandPanel>
  )
}

/**
 * 渲染 Agent 输入框的项目选择面板（/project 触发）。
 */
export const AgentInputProjectPanel = ({
  isOpen,
  position,
  projects,
  activeIndex,
  onSelect,
}: AgentInputProjectPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && projects.length > 0 ? { position, activeIndex, projects } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.projectSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.projects.map((project, index) => {
            const isActive = index === displayData.activeIndex
            return (
              <LxCommandPanelItem
                key={project.id || project.path || "desktop"}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2 text-xs"
                index={index}
                leading={
                  <Folder
                    className={`h-3.5 w-3.5 shrink-0 ${
                      project.isDesktop ? "text-violet-400" : "text-sky-400"
                    }`}
                  />
                }
                onSelect={() => onSelect?.(project)}
              >
                <span
                  className={`truncate font-medium ${
                    project.isDesktop ? "text-violet-300" : "text-white"
                  }`}
                >
                  {project.name}
                </span>
                {project.isCurrent && (
                  <LxTag
                    bgClass="bg-emerald-500/20 text-emerald-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    current
                  </LxTag>
                )}
                <span className="ml-auto shrink-0 max-w-[50%] truncate text-xs text-white/35">
                  {project.path}
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}

/**
 * 渲染 Agent 输入框的会话选择面板（/session 触发）。
 */
export const AgentInputSessionPanel = ({
  isOpen,
  position,
  sessions,
  activeIndex,
  onSelect,
}: AgentInputSessionPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && sessions.length > 0 ? { position, activeIndex, sessions } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.sessionSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.sessions.map((session, index) => {
            const isActive = index === displayData.activeIndex
            const timeDisplay = formatSessionTime(session.updatedAt, t("agent.justNow"))

            return (
              <LxCommandPanelItem
                key={session.id}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2 text-xs"
                index={index}
                leading={<MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-400/70" />}
                onSelect={() => onSelect?.(session)}
              >
                <span className="truncate font-medium text-white">
                  {session.title || t("agent.unnamedSession")}
                </span>
                {session.isCurrent && (
                  <LxTag
                    bgClass="bg-emerald-500/20 text-emerald-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    current
                  </LxTag>
                )}
                {timeDisplay && (
                  <span className="ml-auto shrink-0 text-xs text-white/35">{timeDisplay}</span>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}

const getCommandTags = (command: AgentInputCommand): { label: string; bgClass: string }[] => {
  const tags: { label: string; bgClass: string }[] = []

  if (command.kind === "skill") {
    tags.push({ label: "Skill", bgClass: "bg-[#7c3aed]/20 text-[#c084fc]" })
  } else if (command.kind === "prompt") {
    const scopeLabel = command.source === "project" ? "Custom|Project" : "Custom|Global"
    tags.push({ label: scopeLabel, bgClass: "bg-amber-500/20 text-amber-300" })
  } else {
    tags.push({ label: "Builtin", bgClass: "bg-white/10 text-white/50" })
  }

  return tags
}

export interface AgentUndoConfirmPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  activeIndex: number
  onSelect?: (index: number) => void
}

/**
 * 渲染 /undo 删除会话二次确认面板。
 */
export const AgentUndoConfirmPanel = ({
  isOpen,
  position,
  activeIndex,
  onSelect,
}: AgentUndoConfirmPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = position !== null ? { position, activeIndex } : null

  const options = [
    {
      id: "confirm",
      label: t("agent.confirmUndo"),
      desc: t("agent.undoConfirmDesc"),
      danger: true,
    },
    {
      id: "cancel",
      label: t("agent.cancelUndo"),
      desc: "",
      danger: false,
    },
  ]

  return (
    <LxCommandPanel
      ariaLabel={t("agent.undoConfirmTitle")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          <div className="px-2.5 py-1.5 text-xs font-medium text-white/50 border-b border-white/10 mb-1">
            {t("agent.undoConfirmTitle")}
          </div>
          {options.map((opt, index) => {
            const isActive = index === displayData.activeIndex
            return (
              <LxCommandPanelItem
                key={opt.id}
                active={isActive}
                activeClassName={
                  opt.danger ? "bg-red-500/20 text-red-200" : "bg-white/8 text-white"
                }
                className="flex h-10 items-center gap-2 px-2"
                idleClassName={
                  opt.danger ? "text-red-300/80 hover:bg-white/5" : "text-white/75 hover:bg-white/5"
                }
                index={index}
                leading={
                  <span
                    className={`flex h-5 w-5 flex-none items-center justify-center rounded-[4px] text-xs font-semibold ${
                      opt.danger ? "bg-red-500/30 text-red-200" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {index + 1}
                  </span>
                }
                onSelect={() => onSelect?.(index)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={`flex shrink-0 items-center text-sm font-medium leading-none ${
                      opt.danger ? "text-red-300" : "text-white"
                    }`}
                  >
                    {opt.label}
                  </span>
                  {opt.desc && (
                    <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/40">
                      {opt.desc}
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

/**
 * 渲染 Agent 输入框的 Slash 命令面板。
 */
export const AgentInputCommandPanel = ({
  isOpen,
  position,
  commands,
  activeIndex,
  onSelect,
}: AgentInputCommandPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && commands.length > 0 ? { position, activeIndex, commands } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.slashCommands")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.commands.map((command, index) => {
            const tags = getCommandTags(command)
            const isActive = index === displayData.activeIndex
            const kindStyle = commandKindStyles[command.kind ?? "builtin"]
            const CommandIcon = kindStyle.icon

            return (
              <LxCommandPanelItem
                key={command.id}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2"
                index={index}
                leading={
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-[4px] ${kindStyle.className}`}
                  >
                    <CommandIcon className="h-3.5 w-3.5" />
                  </span>
                }
                onSelect={() => onSelect?.(command)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                    <span className="font-medium">{command.name}</span>
                    {command.argumentHint && (
                      <span className="text-xs font-normal text-white/35">
                        {command.argumentHint}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                    {command.description}
                  </span>
                </span>
                {tags.length > 0 && (
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {tags.map((tag) => (
                      <LxTag
                        key={tag.label}
                        bgClass={tag.bgClass}
                        className="pointer-events-none shrink-0"
                        size="small"
                      >
                        {tag.label}
                      </LxTag>
                    ))}
                  </div>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}

/**
 * 渲染 Agent 输入框的历史提示词选择面板（/historyPrompt 触发）。
 * item 结构对齐 Markdown 变量菜单：图标 + 首行标题 + 单行预览 + tag，激活项展开全文。
 */
export const AgentInputHistoryPromptPanel = ({
  isOpen,
  position,
  prompts,
  activeIndex,
  onSelect,
}: AgentInputHistoryPromptPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && prompts.length > 0 ? { position, activeIndex, prompts } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.historyPromptSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.prompts.map((item, index) => {
            const isActive = index === displayData.activeIndex
            const [firstLine = "", ...restLines] = item.text.split("\n")
            const title = firstLine.trim() || item.text.trim()
            const preview = restLines.join(" ").replace(/\s+/g, " ").trim()

            return (
              <LxCommandPanelItem
                key={item.id}
                active={isActive}
                className="group relative flex min-h-11 flex-col justify-center px-2 py-1"
                index={index}
                onSelect={() => onSelect?.(item)}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-white/5 text-white/70">
                    <History className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm leading-none text-white">
                    {title}
                  </span>
                  {preview && (
                    <span className="min-w-0 flex-1 truncate font-mono text-xs leading-none text-white/45">
                      {preview}
                    </span>
                  )}
                  <LxTag
                    bgClass="bg-white/10 text-white/50"
                    className="pointer-events-none shrink-0 font-mono tabular-nums"
                    size="small"
                  >
                    {displayData.prompts.length - index}
                  </LxTag>
                </div>
                {isActive && (
                  <div className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded border border-white/5 bg-black/20 p-1.5 font-mono text-xs text-white/60">
                    {item.text}
                  </div>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}

export type AgentMentionItem =
  | {
      kind: "skill"
      skill: SkillItem
    }
  | {
      kind: "file"
      file: ProjectFileEntry
    }
  | {
      kind: "design"
      design: FrontDesignItem
    }
  | {
      kind: "subagent"
      subagent: SubagentMentionCandidate
    }
  | {
      kind: "claw"
      claw: ClawMentionCandidate
    }

// 子代理角色提及候选（内置角色 + 用户自定义角色）。
export interface SubagentMentionCandidate {
  name: string
  description: string
  builtIn: boolean
}

// OpenClaw 提及候选（渲染层展示用）。
export interface ClawMentionCandidate {
  instanceId: string
  agentId: string
  // Agent 显示名
  name: string
  // 实例显示名
  instanceName: string
}

export interface AgentInputFilePanelProps {
  isOpen: boolean
  position: CSSProperties | null
  items: AgentMentionItem[]
  activeIndex: number
  worktreeName?: string
  onSelect?: (item: AgentMentionItem) => void
}

/**
 * 渲染 Agent 输入框的项目文件与技能提及面板。
 */
export const AgentInputFilePanel = ({
  isOpen,
  position,
  items,
  activeIndex,
  worktreeName,
  onSelect,
}: AgentInputFilePanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && items.length > 0 ? { position, activeIndex, items, worktreeName } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.fileMention")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.items.map((item, index) => {
            const isActive = index === displayData.activeIndex

            if (item.kind === "skill") {
              const { skill } = item
              const description = skill.shortDescription || skill.description

              return (
                <LxCommandPanelItem
                  key={`skill-${skill.name}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-[#7c3aed]/20 text-[#c084fc]">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-mono font-medium">${skill.name}</span>
                      {skill.displayName && (
                        <span className="text-xs font-normal text-white/35">
                          ({skill.displayName})
                        </span>
                      )}
                    </span>
                    {description && (
                      <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                        {description}
                      </span>
                    )}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass="bg-[#7c3aed]/20 text-[#c084fc]"
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      Skill
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            if (item.kind === "design") {
              const { design } = item
              const title = design.title || t("frontDesign.title")
              const lines = design.html ? design.html.split("\n").length : 0
              const modeLabel = design.mode === "css" ? "CSS" : "Tailwind"
              const versionLabel = design.version ? `v${design.version}` : undefined

              return (
                <LxCommandPanelItem
                  key={`design-${design.id}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-pink-500/20 text-pink-400">
                      <Palette className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-medium text-white truncate max-w-[220px]">{title}</span>
                      {versionLabel && (
                        <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1 py-0.2 text-xs font-medium text-pink-300">
                          {versionLabel}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                      {lines} {t("frontDesign.lines")} · {modeLabel}
                    </span>
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass="bg-pink-500/20 text-pink-300"
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      Design
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            if (item.kind === "subagent") {
              const { subagent } = item
              return (
                <LxCommandPanelItem
                  key={`subagent-${subagent.name}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-sky-500/20 text-sky-300">
                      <UserCog className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-mono font-medium">@agent:{subagent.name}</span>
                    </span>
                    {subagent.description && (
                      <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                        {subagent.description}
                      </span>
                    )}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass={
                        subagent.builtIn
                          ? "bg-sky-500/20 text-sky-300"
                          : "bg-[#7c3aed]/20 text-[#c084fc]"
                      }
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      {subagent.builtIn
                        ? t("agent.subagentMentionTag")
                        : t("settings.subagentsCustomTag")}
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            if (item.kind === "claw") {
              const { claw } = item
              return (
                <LxCommandPanelItem
                  key={`claw-${claw.instanceId}/${claw.agentId}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-sky-500/20 text-sky-400">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-medium text-white truncate max-w-[220px]">
                        {claw.name}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs leading-none text-white/45">
                      {claw.instanceId}/{claw.agentId}
                    </span>
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass="bg-sky-500/20 text-sky-300"
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      {claw.instanceName}
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            const { file } = item
            const normalizedPath = file.path.replace(/\/$/, "")
            const slashIndex = normalizedPath.lastIndexOf("/")
            const name = normalizedPath.slice(slashIndex + 1)
            const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
            const Icon = file.isDirectory ? Folder : FileText
            const directoryTag = getMentionDirectoryTag(file.path)

            return (
              <LxCommandPanelItem
                key={`file-${file.path}`}
                active={isActive}
                className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                index={index}
                leading={<Icon className="h-4 w-4 shrink-0 text-[#eab308]" />}
                onSelect={() => onSelect?.(item)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`min-w-0 flex-1 truncate ${isActive ? "text-white" : "text-white/75"}`}
                    >
                      {file.isDirectory ? `${name}/` : name}
                    </span>
                    {directoryTag && (
                      <LxTag
                        bgClass={directoryTag.bgClass}
                        className="pointer-events-none shrink-0"
                        size="small"
                      >
                        {directoryTag.label}
                      </LxTag>
                    )}
                    {displayData.worktreeName && (
                      <LxTag
                        bgClass="border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                        className="pointer-events-none shrink-0"
                        size="small"
                      >
                        {displayData.worktreeName}
                      </LxTag>
                    )}
                  </span>
                  {directory && (
                    <span className="block truncate text-xs text-white/40">{directory}</span>
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

export interface AgentSkillMentionPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  skills: SkillItem[]
  activeIndex: number
  onSelect?: (skill: SkillItem) => void
}

/**
 * 渲染 Agent 输入框的 Skill 提及面板（$ 触发）。
 */
export const AgentSkillMentionPanel = ({
  isOpen,
  position,
  skills,
  activeIndex,
  onSelect,
}: AgentSkillMentionPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && skills.length > 0 ? { position, activeIndex, skills } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.skillMention")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.skills.map((skill, index) => {
            const isActive = index === displayData.activeIndex
            const description = skill.shortDescription || skill.description

            return (
              <LxCommandPanelItem
                key={skill.name}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2"
                index={index}
                leading={
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-[#7c3aed]/20 text-[#c084fc]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                }
                onSelect={() => onSelect?.(skill)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                    <span className="font-mono font-medium">${skill.name}</span>
                    {skill.displayName && (
                      <span className="text-xs font-normal text-white/35">
                        ({skill.displayName})
                      </span>
                    )}
                  </span>
                  {description && (
                    <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                      {description}
                    </span>
                  )}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <LxTag
                    bgClass="bg-[#7c3aed]/20 text-[#c084fc]"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    Skill
                  </LxTag>
                </div>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
