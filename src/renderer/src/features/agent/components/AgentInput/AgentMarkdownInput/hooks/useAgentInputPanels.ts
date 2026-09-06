import type { EditorView } from "@codemirror/view"
import type { PromptTemplateItem, SkillItem } from "@shared/contracts/agent"
import type { ProjectFileEntry } from "@shared/project"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
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
  type AgentMentionItem,
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
  modelOptions?: AgentMarkdownInputProps["modelOptions"]
  worktreeOptions?: GitWorktreeOption[] | null
  getPanelAnchor: () => HTMLElement | null
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const useAgentInputPanels = ({
  value,
  editorViewRef,
  projectId,
  projectPath,
  currentPath,
  modelOptions = [],
  worktreeOptions,
  getPanelAnchor,
  t,
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
    () => getMatchedCommands(value, promptTemplates, t),
    [value, promptTemplates, t],
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

  const mentionItems = useMemo<AgentMentionItem[]>(() => {
    if (activeMode !== "file") return []
    const skillItems: AgentMentionItem[] = matchedMentionSkills.map((skill) => ({
      kind: "skill",
      skill,
    }))
    const fileItems: AgentMentionItem[] = files.map((file) => ({
      kind: "file",
      file,
    }))
    return [...skillItems, ...fileItems]
  }, [activeMode, matchedMentionSkills, files])
  const mentionItemsRef = useRef(mentionItems)
  mentionItemsRef.current = mentionItems

  const isCommandMode = activeMode === "command" && matchedCommands.length > 0
  const isFileMode = activeMode === "file" && mentionItems.length > 0
  const isModelMode = activeMode === "model" && matchedModels.length > 0
  const isWorktreeMode = activeMode === "worktree" && matchedWorktrees.length > 0
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
      : isCommandMode || isModelMode || isWorktreeMode || isUndoConfirmMode || isSkillMode
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

      const commands = getMatchedCommands(docText, promptTemplatesRef.current, t)
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

      // 3. @ 文件与 Skill 综合提及
      const mention = getMentionQuery(docText, cursor)
      if (mention && (projectId || currentPath || skillsRef.current.length > 0)) {
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
          ? getMarkdownBlockCommands(trigger.kind)
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
    [projectId, currentPath, getPanelAnchor, t],
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
    matchedSkills,
    matchedSkillsRef,
    mentionItems,
    mentionItemsRef,
    isCommandMode,
    isFileMode,
    isModelMode,
    isWorktreeMode,
    isSkillMode,
    isUndoConfirmMode,
    isBlockCommandOpen,
    syncPanels,
    syncPanelsRef,
  }
}
