import type { EditorView } from "@codemirror/view"
import type { AgentSessionSummary, PromptTemplateItem, SkillItem } from "@shared/contracts/agent"
import type { Project, ProjectFileEntry } from "@shared/project"
import type { Locale } from "@shared/settings"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { type FrontDesignItem, frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import type { GitWorktreeOption } from "@/features/git"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import {
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/features/markdown/commands/markdownBlockCommands"
import { projectApi } from "@/features/project/api/projectApi"
import { settingsApi, subscribeSettingsChanged } from "@/features/settings"
import type { TranslationKey } from "@/i18n"
import {
  type AgentInputModel,
  type AgentInputProjectItem,
  type AgentInputSessionItem,
  type AgentMentionItem,
  type ClawMentionCandidate,
  getAgentPanelPosition,
} from "../../AgentInputCommandPanels"
import {
  getMatchedCommands,
  getMentionQuery,
  getSkillMentionQuery,
  isFuzzyMatch,
} from "../agentMarkdownInputUtils"
import type { AgentInputActiveMode, AgentMarkdownInputProps } from "../types"

interface UseAgentInputPanelsProps {
  value: string
  editorViewRef: React.RefObject<EditorView | null>
  projectId?: string
  projectPath?: string
  currentPath?: string
  currentSessionId?: string | null
  allowProjectChange?: boolean
  modelOptions?: AgentMarkdownInputProps["modelOptions"]
  worktreeOptions?: GitWorktreeOption[] | null
  getPanelAnchor: () => HTMLElement | null
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  locale?: Locale
}

export const useAgentInputPanels = ({
  value,
  editorViewRef,
  projectId,
  projectPath,
  currentPath,
  currentSessionId,
  allowProjectChange = true,
  modelOptions = [],
  worktreeOptions,
  getPanelAnchor,
  t,
  locale = "zh",
}: UseAgentInputPanelsProps) => {
  const [panelPosition, setPanelPosition] = useState<React.CSSProperties | null>(null)
  const [activeMode, setActiveMode] = useState<AgentInputActiveMode>(null)
  const activeModeRef = useRef(activeMode)
  activeModeRef.current = activeMode

  const [undoConfirmIndex, setUndoConfirmIndex] = useState(0)
  const undoConfirmIndexRef = useRef(undoConfirmIndex)
  undoConfirmIndexRef.current = undoConfirmIndex

  const [commandIndex, setCommandIndex] = useState(0)
  const commandIndexRef = useRef(commandIndex)
  commandIndexRef.current = commandIndex

  const [fileIndex, setFileIndex] = useState(0)
  const fileIndexRef = useRef(fileIndex)
  fileIndexRef.current = fileIndex

  const [modelIndex, setModelIndex] = useState(0)
  const modelIndexRef = useRef(modelIndex)
  modelIndexRef.current = modelIndex

  const [worktreeIndex, setWorktreeIndex] = useState(0)
  const worktreeIndexRef = useRef(worktreeIndex)
  worktreeIndexRef.current = worktreeIndex

  const [projectIndex, setProjectIndex] = useState(0)
  const projectIndexRef = useRef(projectIndex)
  projectIndexRef.current = projectIndex

  const [sessionIndex, setSessionIndex] = useState(0)
  const sessionIndexRef = useRef(sessionIndex)
  sessionIndexRef.current = sessionIndex

  const [skillIndex, setSkillIndex] = useState(0)
  const skillIndexRef = useRef(skillIndex)
  skillIndexRef.current = skillIndex

  const [files, setFiles] = useState<ProjectFileEntry[]>([])
  const filesRef = useRef(files)
  filesRef.current = files

  const [skills, setSkills] = useState<SkillItem[]>([])
  const skillsRef = useRef(skills)
  skillsRef.current = skills

  const [blockCommands, setBlockCommands] = useState<MarkdownBlockCommand[]>([])
  const blockCommandsRef = useRef(blockCommands)
  blockCommandsRef.current = blockCommands

  const [blockCommandIndex, setBlockCommandIndex] = useState(0)
  const blockCommandIndexRef = useRef(blockCommandIndex)
  blockCommandIndexRef.current = blockCommandIndex

  const [blockCommandPosition, setBlockCommandPosition] = useState<React.CSSProperties | undefined>(
    undefined,
  )

  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>([])
  const promptTemplatesRef = useRef(promptTemplates)
  promptTemplatesRef.current = promptTemplates

  const [projects, setProjects] = useState<Project[]>([])
  const [defaultDesktopPath, setDefaultDesktopPath] = useState<string>("")

  // 加载项目列表（对齐 GitStatusBar）
  useEffect(() => {
    let active = true
    let fetchProjects: Promise<Project[]>
    try {
      fetchProjects =
        typeof projectApi.listProjects === "function"
          ? projectApi.listProjects().catch(() => [])
          : Promise.resolve([])
    } catch {
      fetchProjects = Promise.resolve([])
    }

    let fetchDesktop: Promise<string>
    try {
      fetchDesktop =
        typeof agentApi.getDefaultPath === "function"
          ? agentApi.getDefaultPath().catch(() => "")
          : Promise.resolve("")
    } catch {
      fetchDesktop = Promise.resolve("")
    }

    void Promise.all([fetchProjects, fetchDesktop])
      .then(([list, desktop]) => {
        if (!active) return
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
      })
      .catch(() => {
        if (active) setProjects([])
      })
    return () => {
      active = false
    }
  }, [t])

  const [allSessions, setAllSessions] = useState<AgentSessionSummary[]>(() =>
    sessionListStore.getSessions(),
  )
  useEffect(() => {
    setAllSessions(sessionListStore.getSessions())
    return sessionListStore.subscribe(() => {
      setAllSessions(sessionListStore.getSessions())
    })
  }, [])

  // 加载提示词模板
  useEffect(() => {
    let active = true
    agentApi
      .listPromptTemplates(projectPath)
      .then((templates) => {
        if (active) setPromptTemplates(templates)
      })
      .catch(() => {
        if (active) setPromptTemplates([])
      })
    return () => {
      active = false
    }
  }, [projectPath])

  const matchedCommands = useMemo(
    () => getMatchedCommands(value, promptTemplates, t, allowProjectChange),
    [value, promptTemplates, t, allowProjectChange],
  )
  const matchedCommandsRef = useRef(matchedCommands)
  matchedCommandsRef.current = matchedCommands

  const matchedModels = useMemo<AgentInputModel[]>(() => {
    if (!value.startsWith("/model")) return []
    const query = value.slice("/model".length).trim().toLowerCase()
    return (modelOptions || [])
      .flatMap((group) => {
        if ("options" in group && group.options) {
          return group.options.map((option) => ({
            id: option.value,
            label: option.label,
            provider: group.label,
          }))
        }
        return [{ id: group.value ?? "", label: group.label, provider: "" }]
      })
      .filter((model) => !query || `${model.label} ${model.provider}`.toLowerCase().includes(query))
  }, [value, modelOptions])
  const matchedModelsRef = useRef(matchedModels)
  matchedModelsRef.current = matchedModels

  const matchedWorktrees = useMemo<GitWorktreeOption[]>(() => {
    if (!worktreeOptions || worktreeOptions.length === 0 || !value.startsWith("/gitWorktree"))
      return []
    const query = value.slice("/gitWorktree".length).trim().toLowerCase()
    return worktreeOptions.filter(
      (option) =>
        !query ||
        option.name.toLowerCase().includes(query) ||
        option.path.toLowerCase().includes(query),
    )
  }, [value, worktreeOptions])
  const matchedWorktreesRef = useRef(matchedWorktrees)
  matchedWorktreesRef.current = matchedWorktrees

  const matchedProjects = useMemo<AgentInputProjectItem[]>(() => {
    if (!value.startsWith("/project")) return []
    const query = value.slice("/project".length).trim().toLowerCase()
    const isCurrentPathDesktop = Boolean(
      defaultDesktopPath &&
        (projectPath === defaultDesktopPath || (!projectId && !projectPath && defaultDesktopPath)),
    )

    return projects
      .map((p) => {
        const isDesktop =
          Boolean(defaultDesktopPath && p.path === defaultDesktopPath) ||
          p.name === "Desktop" ||
          p.name === "桌面"
        const isCurrent =
          Boolean(projectPath) && Boolean(p.path)
            ? p.path === projectPath
            : Boolean(projectId) && Boolean(p.id)
              ? p.id === projectId
              : isCurrentPathDesktop && isDesktop
        return {
          id: p.id,
          name: p.name,
          path: p.path || "",
          isDesktop,
          isCurrent,
        }
      })
      .filter(
        (item) =>
          !query ||
          isFuzzyMatch(query, item.name.toLowerCase()) ||
          (item.path && item.path.toLowerCase().includes(query)),
      )
  }, [value, projects, projectPath, projectId, defaultDesktopPath])
  const matchedProjectsRef = useRef(matchedProjects)
  matchedProjectsRef.current = matchedProjects

  const matchedSessions = useMemo<AgentInputSessionItem[]>(() => {
    const isSession = value.startsWith("/session")
    const isResume = value.startsWith("/resume")
    if (!isSession && !isResume) return []
    const prefix = isResume ? "/resume" : "/session"
    const query = value.slice(prefix.length).trim().toLowerCase()

    const filtered = allSessions.filter((s) => {
      if (projectId) {
        return s.projectId === projectId
      }
      const targetPath = projectPath || currentPath
      if (targetPath) {
        return s.projectId == null && s.cwd === targetPath
      }
      return true
    })

    filtered.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime()
      const timeB = new Date(b.updatedAt || b.createdAt).getTime()
      return timeB - timeA
    })

    return filtered
      .map((s) => ({
        id: s.id,
        title: s.title,
        cwd: s.cwd,
        updatedAt: s.updatedAt || s.createdAt,
        isCurrent: s.id === currentSessionId,
      }))
      .filter(
        (item) =>
          !query ||
          isFuzzyMatch(query, item.title.toLowerCase()) ||
          item.id.toLowerCase().includes(query),
      )
  }, [value, allSessions, projectId, projectPath, currentPath, currentSessionId])
  const matchedSessionsRef = useRef(matchedSessions)
  matchedSessionsRef.current = matchedSessions

  // 加载技能并订阅变动
  useEffect(() => {
    let active = true
    const fetchSkills = () => {
      const getSettings =
        typeof window !== "undefined" &&
        typeof (
          window as unknown as {
            api?: { settings?: { getSkillSettings?: () => Promise<{ disabled?: string[] }> } }
          }
        ).api?.settings?.getSkillSettings === "function"
          ? settingsApi.getSkillSettings()
          : Promise.resolve({ disabled: [] as string[] })

      void Promise.all([agentApi.listSkills(currentPath), getSettings])
        .then(([data, config]) => {
          if (!active) return
          const disabledSet = new Set(config?.disabled || [])
          setSkills(data.filter((s) => !disabledSet.has(s.name)))
        })
        .catch(() => {
          if (active) setSkills([])
        })
    }
    fetchSkills()
    const unsubscribe = subscribeSettingsChanged("skills", fetchSkills)
    return () => {
      active = false
      unsubscribe()
    }
  }, [currentPath])

  const matchedSkills = useMemo(() => {
    if (activeMode !== "skill") return []
    const view = editorViewRef.current
    const cursor = view?.state.selection.main.head ?? value.length
    const mention = getSkillMentionQuery(value, cursor)
    if (!mention) return []
    const q = mention.query.toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        isFuzzyMatch(q, s.name.toLowerCase()) ||
        (s.displayName && isFuzzyMatch(q, s.displayName.toLowerCase())) ||
        (s.shortDescription && isFuzzyMatch(q, s.shortDescription.toLowerCase())) ||
        isFuzzyMatch(q, s.description.toLowerCase()),
    )
  }, [activeMode, value, skills, editorViewRef])
  const matchedSkillsRef = useRef(matchedSkills)
  matchedSkillsRef.current = matchedSkills

  // 已启用的 OpenClaw Agent 候选（实例 × Agent 展开）。
  const [clawCandidates, setClawCandidates] = useState<ClawMentionCandidate[]>([])

  const loadClawCandidates = useCallback(async (): Promise<void> => {
    try {
      const settings = await settingsApi.getOpenClawSettings()
      const candidates: ClawMentionCandidate[] = []
      for (const [instanceId, instance] of Object.entries(settings.instances)) {
        if (!instance.enabled) continue
        for (const agent of instance.agents) {
          candidates.push({
            instanceId,
            agentId: agent.id,
            name: agent.name,
            instanceName: instance.name,
          })
        }
      }
      setClawCandidates(candidates)
    } catch {
      setClawCandidates([])
    }
  }, [])

  useEffect(() => {
    void loadClawCandidates()
    return subscribeSettingsChanged("openclaw", () => {
      void loadClawCandidates()
    })
  }, [loadClawCandidates])

  const matchedMentionClawAgents = useMemo<ClawMentionCandidate[]>(() => {
    if (activeMode !== "file" || clawCandidates.length === 0) return []
    const view = editorViewRef.current
    const cursor = view?.state.selection.main.head ?? value.length
    const mention = getMentionQuery(value, cursor)
    if (!mention) return []

    // `@claw:instance/agent` 与 `@claw` 前缀都用于筛选 OpenClaw 候选。
    let q = mention.query.toLowerCase()
    if (q.startsWith("claw")) {
      q = q.slice(4).replace(/^[:/]+/, "")
    }
    if (!q) return clawCandidates

    return clawCandidates.filter(
      (candidate) =>
        isFuzzyMatch(q, candidate.name.toLowerCase()) ||
        isFuzzyMatch(q, candidate.agentId.toLowerCase()) ||
        isFuzzyMatch(q, candidate.instanceId.toLowerCase()) ||
        isFuzzyMatch(q, `${candidate.instanceId}/${candidate.agentId}`.toLowerCase()),
    )
  }, [activeMode, value, clawCandidates, editorViewRef])

  const matchedMentionSkills = useMemo(() => {
    if (activeMode !== "file") return []
    const view = editorViewRef.current
    const cursor = view?.state.selection.main.head ?? value.length
    const mention = getMentionQuery(value, cursor)
    if (!mention) return []
    const q = mention.query.toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        isFuzzyMatch(q, s.name.toLowerCase()) ||
        (s.displayName && isFuzzyMatch(q, s.displayName.toLowerCase())) ||
        (s.shortDescription && isFuzzyMatch(q, s.shortDescription.toLowerCase())) ||
        isFuzzyMatch(q, s.description.toLowerCase()),
    )
  }, [activeMode, value, skills, editorViewRef])

  const matchedMentionDesigns = useMemo<FrontDesignItem[]>(() => {
    if (activeMode !== "file") return []
    const view = editorViewRef.current
    const cursor = view?.state.selection.main.head ?? value.length
    const mention = getMentionQuery(value, cursor)
    if (!mention) return []
    const q = mention.query.toLowerCase()

    const currentSessionId =
      agentTabStore.getActiveTab()?.sessionId ?? sessionListStore.getCurrentSessionId()

    const allDesigns = frontDesignStore.getAllDesigns()
    const sessionDesigns = allDesigns.filter((d) => {
      if (currentSessionId) {
        return d.sessionId === currentSessionId
      }
      return true
    })

    if (!q) return sessionDesigns

    return sessionDesigns.filter(
      (d) => isFuzzyMatch(q, d.title.toLowerCase()) || isFuzzyMatch(q, d.id.toLowerCase()),
    )
  }, [activeMode, value, editorViewRef])

  const mentionItems = useMemo<AgentMentionItem[]>(() => {
    if (activeMode !== "file") return []
    const designItems: AgentMentionItem[] = matchedMentionDesigns.map((design) => ({
      kind: "design",
      design,
    }))
    const skillItems: AgentMentionItem[] = matchedMentionSkills.map((skill) => ({
      kind: "skill",
      skill,
    }))
    const fileItems: AgentMentionItem[] = files.map((file) => ({
      kind: "file",
      file,
    }))
    // OpenClaw 候选置于末尾：不改变既有 @ 提及的默认首选项行为。
    const clawItems: AgentMentionItem[] = matchedMentionClawAgents.map((claw) => ({
      kind: "claw",
      claw,
    }))
    return [...designItems, ...skillItems, ...fileItems, ...clawItems]
  }, [activeMode, matchedMentionDesigns, matchedMentionSkills, matchedMentionClawAgents, files])
  const mentionItemsRef = useRef(mentionItems)
  mentionItemsRef.current = mentionItems

  const isCommandMode = activeMode === "command" && matchedCommands.length > 0
  const isFileMode = activeMode === "file" && mentionItems.length > 0
  const isModelMode = activeMode === "model" && matchedModels.length > 0
  const isWorktreeMode = activeMode === "worktree" && matchedWorktrees.length > 0
  const isProjectMode = activeMode === "project" && matchedProjects.length > 0
  const isSessionMode = activeMode === "session" && matchedSessions.length > 0
  const isSkillMode = activeMode === "skill" && matchedSkills.length > 0
  const isUndoConfirmMode = activeMode === "undo_confirm"
  const isBlockCommandOpen = blockCommands.length > 0 && !!blockCommandPosition

  // 计算面板位置
  const updatePanelPosition = useCallback((): void => {
    const anchor = getPanelAnchor()
    if (!anchor) {
      setPanelPosition(null)
      return
    }
    const kind: "command" | "file" | null = isFileMode
      ? "file"
      : isCommandMode ||
          isModelMode ||
          isWorktreeMode ||
          isProjectMode ||
          isSessionMode ||
          isUndoConfirmMode ||
          isSkillMode
        ? "command"
        : null
    if (!kind) {
      setPanelPosition(null)
      return
    }
    setPanelPosition(getAgentPanelPosition(kind, anchor.getBoundingClientRect()))
  }, [
    isCommandMode,
    isFileMode,
    isModelMode,
    isWorktreeMode,
    isProjectMode,
    isSessionMode,
    isSkillMode,
    isUndoConfirmMode,
    getPanelAnchor,
  ])

  useEffect(() => {
    updatePanelPosition()
  }, [updatePanelPosition])

  // 文件检索联动
  useEffect(() => {
    if (activeMode !== "file") {
      setFiles([])
      return
    }
    const view = editorViewRef.current
    const cursor = view?.state.selection.main.head ?? value.length
    const mention = getMentionQuery(value, cursor)
    if (!mention) return
    let current = true

    const fetchPromise = projectId
      ? projectApi.searchFiles(projectId, mention.query)
      : currentPath
        ? projectApi.searchDirectoryFiles(currentPath, mention.query)
        : Promise.resolve([])

    void fetchPromise
      .then((results) => {
        if (current) setFiles(results)
      })
      .catch(() => {
        if (current) setFiles([])
      })
    return () => {
      current = false
    }
  }, [value, activeMode, projectId, currentPath, editorViewRef])

  // 同步面板状态
  const syncPanels = useCallback(
    (docText: string, cursor: number, view: EditorView): void => {
      // 1. 斜杠命令相关
      const isModelInput = docText === "/model" || docText.startsWith("/model ")
      if (isModelInput) {
        setActiveMode("model")
        setModelIndex(0)
        setFiles([])
        setBlockCommands([])
        return
      }

      const isWorktreeInput = docText === "/gitWorktree" || docText.startsWith("/gitWorktree ")
      if (isWorktreeInput) {
        setActiveMode("worktree")
        setWorktreeIndex(0)
        setFiles([])
        setBlockCommands([])
        return
      }

      const isProjectInput = docText === "/project" || docText.startsWith("/project ")
      if (isProjectInput) {
        if (!allowProjectChange) {
          setActiveMode(null)
          return
        }
        setActiveMode("project")
        setProjectIndex(0)
        setFiles([])
        setBlockCommands([])
        return
      }

      const isSessionInput =
        docText === "/session" ||
        docText.startsWith("/session ") ||
        docText === "/resume" ||
        docText.startsWith("/resume ")
      if (isSessionInput) {
        setActiveMode("session")
        setSessionIndex(0)
        setFiles([])
        setBlockCommands([])
        return
      }

      const commands = getMatchedCommands(
        docText,
        promptTemplatesRef.current,
        t,
        allowProjectChange,
      )
      if (commands.length > 0) {
        setActiveMode("command")
        setCommandIndex(0)
        setFiles([])
        setBlockCommands([])
        return
      }

      // 2. $ Skill 提及
      const skillMention = getSkillMentionQuery(docText, cursor)
      if (skillMention) {
        setActiveMode("skill")
        setSkillIndex(0)
        setFiles([])
        setBlockCommands([])
        return
      }

      // 3. @ 文件、Skill 与设计原型综合提及
      const mention = getMentionQuery(docText, cursor)
      if (
        mention &&
        (projectId ||
          currentPath ||
          skillsRef.current.length > 0 ||
          frontDesignStore.getAllDesigns().length > 0)
      ) {
        setActiveMode("file")
        setFileIndex(0)
        setBlockCommands([])
        return
      }
      setActiveMode(null)

      // 4. Markdown 块级命令触发
      const line = view.state.doc.lineAt(cursor)
      const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
      const isClosingCodeFence =
        trigger?.kind === "codeBlock" &&
        isInsideMarkdownCodeFence(view.state.doc.sliceString(0, line.from))

      let isContinuousList = false
      if (trigger && line.number > 1) {
        const prevLine = view.state.doc.line(line.number - 1)
        const prevText = prevLine.text
        if (trigger.kind === "unorderedList" && /^(\s*)[-+*](\s|$)/.test(prevText)) {
          isContinuousList = true
        } else if (trigger.kind === "orderedList" && /^(\s*)\d+[.)](\s|$)/.test(prevText)) {
          isContinuousList = true
        } else if (trigger.kind === "quote" && /^(\s*)>(\s|$)/.test(prevText)) {
          isContinuousList = true
        } else if (trigger.kind === "table" && /^(\s*)\|/.test(prevText)) {
          isContinuousList = true
        }
      }

      const matchedBlockCmds =
        trigger && !isClosingCodeFence && !isContinuousList
          ? getMarkdownBlockCommands(trigger.kind, locale)
          : []

      if (matchedBlockCmds.length > 0 && trigger) {
        const measurePos = trigger.kind === "codeBlock" && cursor > line.from ? cursor - 1 : cursor
        let position: React.CSSProperties | undefined
        try {
          const coords = view.coordsAtPos(measurePos)
          if (coords) {
            const panelWidth = 320
            const left = Math.min(
              Math.max(coords.left, 8),
              Math.max(window.innerWidth - panelWidth - 8, 8),
            )
            position =
              window.innerHeight - coords.bottom < 240
                ? { left, top: "auto", bottom: window.innerHeight - coords.top + 6 }
                : { left, top: coords.bottom + 6, bottom: "auto" }
          }
        } catch {
          position = undefined
        }
        if (!position) {
          const anchor = getPanelAnchor()
          if (anchor) {
            position = getAgentPanelPosition("command", anchor.getBoundingClientRect())
          }
        }
        if (position) {
          setBlockCommands(matchedBlockCmds)
          setBlockCommandPosition(position)
        }
        return
      }
      setBlockCommands([])
      setBlockCommandPosition(undefined)
    },
    [projectId, currentPath, getPanelAnchor, t, allowProjectChange],
  )

  const syncPanelsRef = useRef(syncPanels)
  syncPanelsRef.current = syncPanels

  return {
    panelPosition,
    updatePanelPosition,
    activeMode,
    setActiveMode,
    activeModeRef,
    undoConfirmIndex,
    setUndoConfirmIndex,
    undoConfirmIndexRef,
    commandIndex,
    setCommandIndex,
    commandIndexRef,
    fileIndex,
    setFileIndex,
    fileIndexRef,
    modelIndex,
    setModelIndex,
    modelIndexRef,
    worktreeIndex,
    setWorktreeIndex,
    worktreeIndexRef,
    projectIndex,
    setProjectIndex,
    projectIndexRef,
    sessionIndex,
    setSessionIndex,
    sessionIndexRef,
    skillIndex,
    setSkillIndex,
    skillIndexRef,
    blockCommands,
    setBlockCommands,
    blockCommandsRef,
    blockCommandIndex,
    setBlockCommandIndex,
    blockCommandIndexRef,
    blockCommandPosition,
    setBlockCommandPosition,
    promptTemplates,
    skills,
    matchedCommands,
    matchedCommandsRef,
    matchedModels,
    matchedModelsRef,
    matchedWorktrees,
    matchedWorktreesRef,
    matchedProjects,
    matchedProjectsRef,
    matchedSessions,
    matchedSessionsRef,
    matchedSkills,
    matchedSkillsRef,
    mentionItems,
    mentionItemsRef,
    isCommandMode,
    isFileMode,
    isModelMode,
    isWorktreeMode,
    isProjectMode,
    isSessionMode,
    isSkillMode,
    isUndoConfirmMode,
    isBlockCommandOpen,
    syncPanels,
    syncPanelsRef,
  }
}
