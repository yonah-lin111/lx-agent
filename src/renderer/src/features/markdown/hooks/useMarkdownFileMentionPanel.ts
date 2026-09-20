import type { EditorView } from "@codemirror/view"
import type { RefObject } from "react"
import { useRef, useState } from "react"
import {
  getMarkdownTemplateBlockContent,
  isInsideMarkdownCodeFence,
} from "@/features/markdown/commands/markdownBlockCommands"
import { getMarkdownReferenceProjectPaths } from "@/features/markdown/commands/markdownReferenceCommands"
import {
  createMarkdownTemplateFileReference,
  filterMarkdownTemplateFileCandidates,
  getMarkdownTemplateFileCandidates,
  getMarkdownTemplateFileTrigger,
  type MarkdownTemplateFileCandidate,
} from "@/features/markdown/commands/markdownTemplateFileCommands"
import {
  filterMarkdownVariables,
  getMarkdownVarContentItems,
  isInsideMarkdownFrontmatter,
  isMarkdownVarContentKeyLine,
  type MarkdownVariableEntry,
  parseMarkdownVariables,
} from "@/features/markdown/commands/markdownVariableCommands"
import { MARKDOWN_FILE_MENTION_PATH_PATTERN } from "@/features/markdown/extensions/markdownFileMentions"
import type {
  FileMentionPanelState,
  MarkdownLetterPanelState,
  MarkdownPanelsContextRefs,
} from "@/features/markdown/hooks/useMarkdownPanels.types"
import type { MarkdownFileMentionEntry } from "@/features/markdown/types"
import { resolveMarkdownContextDirectory } from "@/features/markdown/utils/markdownContextDirectory"
import { getMarkdownPanelPosition } from "@/features/markdown/utils/markdownPanelPosition"

/**
 * 文件提及面板与字母快捷输入面板：@ 查询、字母候选过滤、插入与键盘导航。
 * 字母快捷输入面板合并展示文件/引用候选与页面变量候选。
 */
export const useMarkdownFileMentionPanel = ({
  editorViewRef,
  context,
}: {
  editorViewRef: RefObject<EditorView | null>
  context: Pick<
    MarkdownPanelsContextRefs,
    | "projectIdRef"
    | "projectPathRef"
    | "worktreePathRef"
    | "worktreesRef"
    | "projectBranchRef"
    | "referencedProjectPathsRef"
    | "onSearchFilesRef"
    | "onSearchReferencedFilesRef"
    | "onSearchDirectoryFilesRef"
  >
}) => {
  const {
    projectIdRef,
    projectPathRef,
    worktreePathRef,
    worktreesRef,
    projectBranchRef,
    referencedProjectPathsRef,
    onSearchFilesRef,
    onSearchReferencedFilesRef,
    onSearchDirectoryFilesRef,
  } = context
  const fileMentionPanelRef = useRef<FileMentionPanelState | null>(null)
  const activeFileMentionIndexRef = useRef(0)
  const fileSearchRequestRef = useRef(0)
  const templateFilePanelRef = useRef<MarkdownLetterPanelState | null>(null)
  const activeTemplateFileIndexRef = useRef(0)
  const [fileMentionPanel, setFileMentionPanel] = useState<FileMentionPanelState | null>(null)
  const [activeFileMentionIndex, setActiveFileMentionIndex] = useState(0)
  const [templateFilePanel, setTemplateFilePanel] = useState<MarkdownLetterPanelState | null>(null)
  const [activeTemplateFileIndex, setActiveTemplateFileIndex] = useState(0)

  /**
   * 关闭文件提及面板并取消过期查询结果。
   */
  const closeFileMentionPanel = (): void => {
    fileSearchRequestRef.current += 1
    fileMentionPanelRef.current = null
    activeFileMentionIndexRef.current = 0
    setFileMentionPanel(null)
    setActiveFileMentionIndex(0)
  }

  /**
   * 关闭模板块文件快捷输入面板。
   */
  const closeTemplateFilePanel = (): void => {
    templateFilePanelRef.current = null
    activeTemplateFileIndexRef.current = 0
    setTemplateFilePanel(null)
    setActiveTemplateFileIndex(0)
  }

  /**
   * 根据光标前的 @ 查询同步项目文件提及面板。
   */
  const syncFileMentionPanel = (view: EditorView): void => {
    const searchFiles = onSearchFilesRef.current
    const searchReferencedFiles = onSearchReferencedFilesRef.current
    const searchDirectoryFiles = onSearchDirectoryFilesRef.current
    const activeProjectId = projectIdRef.current
    const cursor = view.state.selection.main.head
    const docText = view.state.doc.toString()
    const prefix = view.state.doc.sliceString(0, cursor)
    const match = new RegExp(
      String.raw`(^|[\s\[])@((?:${MARKDOWN_FILE_MENTION_PATH_PATTERN})?)$`,
      "u",
    ).exec(prefix)
    const templateBlockContent = getMarkdownTemplateBlockContent(docText, cursor)
    const searchProjectPaths = [
      ...new Set([
        ...referencedProjectPathsRef.current,
        ...getMarkdownReferenceProjectPaths(templateBlockContent ?? docText),
      ]),
    ]
    const context = resolveMarkdownContextDirectory(view, {
      projectPath: projectPathRef.current,
      worktreePath: worktreePathRef.current,
      worktrees: worktreesRef.current,
      projectBranch: projectBranchRef.current,
    })
    const canSearchCurrentProject = Boolean(
      context && (searchDirectoryFiles || (searchFiles && activeProjectId)),
    )
    const canSearchReferencedProjects = Boolean(
      searchReferencedFiles && searchProjectPaths.length > 0,
    )

    if (!match || (!canSearchCurrentProject && !canSearchReferencedProjects)) {
      closeFileMentionPanel()
      return
    }

    const coords = view.coordsAtPos(cursor)
    if (!coords) {
      closeFileMentionPanel()
      return
    }

    const requestId = fileSearchRequestRef.current + 1
    fileSearchRequestRef.current = requestId
    const query = match[2] ?? ""
    const start = cursor - query.length - 1

    const currentProjectSearch = canSearchCurrentProject
      ? (context!.directory === projectPathRef.current && searchFiles && activeProjectId
          ? searchFiles(activeProjectId, query)
          : searchDirectoryFiles!(context!.directory, query)
        ).then((files) =>
          files.map((file) => ({
            ...file,
            mentionPath: file.path,
            source: "current" as const,
            worktreeName: context!.worktreeName,
          })),
        )
      : Promise.resolve([])
    const referencedProjectSearch = canSearchReferencedProjects
      ? searchReferencedFiles!(searchProjectPaths, query).then((files) =>
          files.map((file) => ({
            ...file,
            mentionPath: `${file.projectPath.replace(/[\\/]+$/, "")}/${file.path}`,
            source: "reference" as const,
          })),
        )
      : Promise.resolve([])

    void Promise.all([currentProjectSearch, referencedProjectSearch])
      .then(([currentProjectFiles, referencedProjectFiles]) => {
        if (fileSearchRequestRef.current !== requestId) return
        const files = [...currentProjectFiles, ...referencedProjectFiles]
        if (files.length === 0) {
          fileMentionPanelRef.current = null
          setFileMentionPanel(null)
          return
        }

        const position = getMarkdownPanelPosition("file", coords)
        const panel = { files, position, start }
        fileMentionPanelRef.current = panel
        activeFileMentionIndexRef.current = 0
        setFileMentionPanel(panel)
        setActiveFileMentionIndex(0)
      })
      .catch(() => closeFileMentionPanel())
  }

  /**
   * 将选中的项目相对路径插入当前 @ 提及位置。
   */
  const selectFileMention = (file: MarkdownFileMentionEntry): void => {
    const view = editorViewRef.current
    const panel = fileMentionPanelRef.current
    if (!view || !panel) return

    const cursor = view.state.selection.main.head
    const insertion = `@${file.mentionPath} `
    view.dispatch({
      changes: { from: panel.start, to: cursor, insert: insertion },
      selection: { anchor: panel.start + insertion.length },
    })
    view.focus()
    closeFileMentionPanel()
  }

  /**
   * 处理文件提及面板的键盘导航。
   */
  const handleFileMentionKey = (key: "ArrowDown" | "ArrowUp"): boolean => {
    const panel = fileMentionPanelRef.current
    if (!panel) return false

    const offset = key === "ArrowDown" ? 1 : -1
    const nextIndex =
      (activeFileMentionIndexRef.current + offset + panel.files.length) % panel.files.length
    activeFileMentionIndexRef.current = nextIndex
    setActiveFileMentionIndex(nextIndex)
    return true
  }

  /**
   * 根据光标的裸字母片段同步字母快捷输入面板。
   * 候选 = 当前模板块内已出现的引用 + 变量模板块 @content 固定内容块中的引用 + 页面变量；
   * 文件候选在前、变量候选在后；代码围栏、块标记行与旧版 frontmatter 内不触发，@ 前缀由文件提及面板处理。
   */
  const syncTemplateFilePanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const docText = view.state.doc.toString()
    const prefix = view.state.doc.sliceString(0, cursor)
    const lineText = view.state.doc.lineAt(cursor).text

    if (
      isInsideMarkdownCodeFence(prefix) ||
      isInsideMarkdownFrontmatter(docText, cursor) ||
      /^\s*(?:&&&|\+\+\+|\$\$\$)/.test(lineText) ||
      isMarkdownVarContentKeyLine(lineText)
    ) {
      closeTemplateFilePanel()
      return
    }

    const trigger = getMarkdownTemplateFileTrigger(prefix)
    if (!trigger) {
      closeTemplateFilePanel()
      return
    }

    const blockContent = getMarkdownTemplateBlockContent(docText, cursor)
    const referencedRoots = [
      ...new Set([
        ...referencedProjectPathsRef.current,
        ...getMarkdownReferenceProjectPaths(blockContent ?? docText),
      ]),
    ]
    const seenCandidates = new Set<string>()
    const candidates: MarkdownTemplateFileCandidate[] = []
    for (const candidate of [
      ...getMarkdownTemplateFileCandidates(blockContent ?? "", referencedRoots, "templateBlock"),
      ...getMarkdownTemplateFileCandidates(
        getMarkdownVarContentItems(docText).join("\n"),
        referencedRoots,
        "varContentBlock",
      ),
    ]) {
      const key = `${candidate.kind}:${candidate.path}`
      if (seenCandidates.has(key)) continue
      seenCandidates.add(key)
      candidates.push(candidate)
    }
    const matched = filterMarkdownTemplateFileCandidates(candidates, trigger.fragment)
    const variables = filterMarkdownVariables(parseMarkdownVariables(docText), trigger.fragment)
    if (matched.length === 0 && variables.length === 0) {
      closeTemplateFilePanel()
      return
    }

    const coords = view.coordsAtPos(cursor)
    if (!coords) {
      closeTemplateFilePanel()
      return
    }

    const files: MarkdownFileMentionEntry[] = matched.map((candidate) => ({
      path: candidate.path,
      isDirectory: candidate.isDirectory,
      mentionPath: candidate.path,
      source: "current" as const,
      templateKind: candidate.kind,
      templateSource: candidate.source,
    }))
    const panel: MarkdownLetterPanelState = {
      files,
      variables,
      position: getMarkdownPanelPosition("file", coords),
      start: trigger.start,
    }
    templateFilePanelRef.current = panel
    activeTemplateFileIndexRef.current = 0
    setTemplateFilePanel(panel)
    setActiveTemplateFileIndex(0)
  }

  /**
   * 将选中的文件引用插入当前裸片段位置。
   */
  const selectTemplateFile = (file: MarkdownFileMentionEntry): void => {
    const view = editorViewRef.current
    const panel = templateFilePanelRef.current
    if (!view || !panel) return

    const cursor = view.state.selection.main.head
    const insertion = createMarkdownTemplateFileReference(file)
    view.dispatch({
      changes: { from: panel.start, to: cursor, insert: insertion },
      selection: { anchor: panel.start + insertion.length },
    })
    view.focus()
    closeTemplateFilePanel()
  }

  /**
   * 将选中的页面变量值插入当前裸片段位置。
   */
  const selectTemplateVariable = (variable: MarkdownVariableEntry): void => {
    const view = editorViewRef.current
    const panel = templateFilePanelRef.current
    if (!view || !panel) return

    const cursor = view.state.selection.main.head
    const insertion = variable.value
    view.dispatch({
      changes: { from: panel.start, to: cursor, insert: insertion },
      selection: { anchor: panel.start + insertion.length },
    })
    view.focus()
    closeTemplateFilePanel()
  }

  /**
   * 处理字母快捷输入面板的键盘导航（文件候选与变量候选共用一个索引空间）。
   */
  const handleTemplateFileKey = (offset: number): boolean => {
    const panel = templateFilePanelRef.current
    if (!panel) return false

    const total = panel.files.length + panel.variables.length
    if (total === 0) return false

    const nextIndex = (activeTemplateFileIndexRef.current + offset + total) % total
    activeTemplateFileIndexRef.current = nextIndex
    setActiveTemplateFileIndex(nextIndex)
    return true
  }

  return {
    fileMentionPanel,
    activeFileMentionIndex,
    fileMentionPanelRef,
    activeFileMentionIndexRef,
    closeFileMentionPanel,
    syncFileMentionPanel,
    selectFileMention,
    handleFileMentionKey,
    templateFilePanel,
    activeTemplateFileIndex,
    templateFilePanelRef,
    activeTemplateFileIndexRef,
    closeTemplateFilePanel,
    syncTemplateFilePanel,
    selectTemplateFile,
    selectTemplateVariable,
    handleTemplateFileKey,
  }
}
