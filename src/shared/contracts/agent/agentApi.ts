// 渲染进程可调用的 Agent IPC 接口契约。

import type { ModelSelection } from "@shared/settings"
import type { AgentEvent } from "./events"
import type { ExportFrontDesignPngOptions, ExportFrontDesignPngResult } from "./frontDesign"
import type { InstructionFileInfo, InstructionScope, SaveInstructionInput } from "./instructions"
import type { AgentMessage, ModelSwitchMessage, SuggestedQuestionContextMessage } from "./messages"
import type { CollaborationMode, PermissionResponse } from "./permissions"
import type { PromptAssembly, PromptTemplateItem, SkillItem } from "./promptAssembly"
import type { QuestionResponse } from "./questions"
import type {
  JobId,
  JobReadResult,
  JobSnapshot,
  JobStatus,
  LspInstallResult,
  LspServerStatusItem,
  McpServerStatusItem,
} from "./runtime"
import type {
  AgentCompactResult,
  AgentContextUsage,
  AgentForkResult,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendOptions,
  AgentSendResult,
  AgentSessionSummary,
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  CopySessionOptions,
  CopySessionResult,
  ExportSessionOptions,
  ExportSessionResult,
} from "./session"
import type {
  ImportSkillFilesResult,
  SaveSkillInput,
  SaveSkillResult,
  SkillFileContent,
  SkillFileEntry,
  SkillFileOpResult,
} from "./skills"

// 渲染进程可调用的 Agent IPC 接口。
export interface AgentApi {
  agent: {
    send: (
      text: string,
      selection?: ModelSelection,
      context?: AgentSendContext,
      options?: AgentSendOptions,
    ) => Promise<AgentSendResult>
    // 继续生成：续写被截断/中止的上一轮输出（busy 时返回 { ok: false }）。
    continue: (prompt?: string, sessionId?: string, tabId?: string) => Promise<AgentSendResult>
    // 切换当前会话工作区：更新会话工具执行目录（cwd），下次装配按新目录重建工具集。
    switchWorktree: (
      path: string,
      sessionId?: string,
      tabId?: string,
    ) => Promise<AgentSwitchWorktreeResult>
    // 切换当前会话项目：更新会话关联的项目 ID 与工具执行目录（cwd），重新加载工具集与技能。
    switchProject: (
      projectId: string,
      path: string,
      sessionId?: string,
      tabId?: string,
    ) => Promise<AgentSwitchProjectResult>
    // 切换当前会话大模型：在已有会话中插入 model_change entry 并推送事件。
    switchModel: (
      selection: ModelSelection,
      sessionId?: string,
      tabId?: string,
    ) => Promise<{ ok: true; message?: ModelSwitchMessage } | { ok: false; error: string }>
    // 切换协作模式（default / plan）。
    setCollaborationMode: (
      mode: CollaborationMode,
      sessionId?: string,
      tabId?: string,
    ) => Promise<{ ok: true } | { ok: false; error: string }>
    // 手动触发上下文压缩（/compact）：摘要化早期历史并建立新边界；设置禁用/无可压缩内容时返回原因。
    compact: (sessionId?: string, tabId?: string) => Promise<AgentCompactResult>
    // 撤销最后一次手动压缩（/undo 对压缩摘要触发；自动压缩不可撤销）。
    undoCompaction: (sessionId?: string, tabId?: string) => Promise<AgentUndoCompactionResult>
    abort: (sessionId?: string, tabId?: string) => Promise<void>
    restore: (messages: AgentMessage[], sessionId?: string, tabId?: string) => Promise<void>
    listSessions: () => Promise<AgentSessionSummary[]>
    restoreSession: (sessionId: string, tabId?: string) => Promise<AgentRestoredSession>
    renameSession: (sessionId: string, title: string) => Promise<void>
    // 设置会话置顶状态（幂等；不刷新 updated_at）。
    setSessionPinned: (sessionId: string, pinned: boolean) => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
    // 批量删除会话（逐条复用单删的完整清理链；空数组为空操作）。
    deleteSessions: (sessionIds: string[]) => Promise<void>
    // 删除一轮对话：以该轮用户消息的 timestamp 定位（问题 + 回答 + 工具调用级联删除）。
    deleteMessageTurn: (sessionId: string, userMessageTimestamp: number) => Promise<void>
    // 会话分支：从指定用户轮（timestamp 定位）切割复制历史到新会话；不传 timestamp = 整会话复制（v1 UI 不暴露）。
    forkSession: (sessionId: string, userMessageTimestamp?: number) => Promise<AgentForkResult>
    // 获取全部 MCP server 的连接状态。
    getMcpStatus: () => Promise<McpServerStatusItem[]>
    // 获取各 LSP server 包的安装状态。
    getLspStatus: () => Promise<LspServerStatusItem[]>
    // 安装缺失的 LSP server 包（npm install -g）。
    installLspServers: () => Promise<LspInstallResult>
    // 加载可用 Prompt 模板列表。
    listPromptTemplates: (cwd?: string) => Promise<PromptTemplateItem[]>
    // 加载可用 Skill 列表。
    listSkills: (cwd?: string, force?: boolean) => Promise<SkillItem[]>
    // 获取指定 Skill 的 Markdown 正文内容。
    getSkillContent: (name: string, cwd?: string) => Promise<string | null>
    // 列出 Skill 目录内的文件树（不含隐藏项与 node_modules）。
    listSkillFiles: (skillDir: string) => Promise<SkillFileEntry[]>
    // 读取 Skill 目录内的文本文件。
    readSkillFile: (skillDir: string, relativePath: string) => Promise<SkillFileContent>
    // 写入 Skill 目录内的文本文件（自动创建父目录）。
    writeSkillFile: (
      skillDir: string,
      relativePath: string,
      content: string,
    ) => Promise<SkillFileOpResult>
    // 删除 Skill 目录内的文件（移入系统回收站；SKILL.md 需走整体删除）。
    deleteSkillFile: (skillDir: string, relativePath: string) => Promise<SkillFileOpResult>
    // 移动/重命名 Skill 目录内的文件（含目录）。
    moveSkillFile: (
      skillDir: string,
      fromRelativePath: string,
      toRelativePath: string,
    ) => Promise<SkillFileOpResult>
    // 打开系统文件选择器并复制选中文件进 Skill 目录（返回新相对路径；dialogTitle 为本地化标题）。
    importSkillFiles: (
      skillDir: string,
      targetDirRelativePath: string,
      dialogTitle?: string,
    ) => Promise<ImportSkillFilesResult>
    // 新建或更新 Skill（frontmatter 合并保留未知键；改名即重命名目录）。
    saveSkill: (input: SaveSkillInput) => Promise<SaveSkillResult>
    // 读取 AGENTS.md 指令文件信息（用户级或项目级）。
    getInstruction: (scope: InstructionScope, projectPath?: string) => Promise<InstructionFileInfo>
    // 保存 AGENTS.md 指令文件（不存在时创建）。
    saveInstruction: (input: SaveInstructionInput) => Promise<InstructionFileInfo>
    // 导出会话（HTML / Markdown / JSONL）。
    exportSession: (options: ExportSessionOptions) => Promise<ExportSessionResult>
    // 复制会话内容（Markdown 全文或最后一条 Assistant 回复）。
    copySession: (options?: CopySessionOptions) => Promise<CopySessionResult>
    // 为最后一条 AI 回答生成后续建议问题。
    suggestedQuestions: (
      messages: SuggestedQuestionContextMessage[],
      excludedQuestions?: string[],
    ) => Promise<string[]>
    // 获取系统默认的桌面路径（做梦的路径）
    getDefaultPath: () => Promise<string>
    // 响应权限确认请求（requestId 匹配 main 侧挂起的请求）。
    permissionRespond: (response: PermissionResponse) => Promise<{ ok: boolean }>
    // 响应提问请求（requestId 匹配 main 侧挂起的提问；answers 或 dismissed）。
    questionRespond: (response: QuestionResponse) => Promise<{ ok: boolean }>
    // 用系统默认编辑器打开文件并定位到行（LSP 结果跳转）。
    openFileAt: (filePath: string, line: number) => Promise<{ ok: boolean }>
    // 在系统文件管理器/资源管理器中高亮定位文件。
    showItemInFolder: (filePath: string) => Promise<{ ok: boolean }>
    // 查询当前会话上下文容量（模型切换后状态栏主动刷新；selection 指定要显示的模型窗口）。
    getContextUsage: (
      selection?: ModelSelection,
      sessionId?: string,
      tabId?: string,
    ) => Promise<AgentContextUsage>
    // 查询当前会话全部可见后台任务。
    listJobs: (sessionId?: string) => Promise<JobSnapshot[]>
    // 终止指定后台长任务（向进程树发送 SIGTERM / taskkill）。
    killJob: (
      jobId: JobId,
      reason?: string,
    ) => Promise<{ ok: boolean; status?: JobStatus; error?: string }>
    // 移除/关闭指定后台长任务记录（若运行中则先终止进程再移除）。
    removeJob: (jobId: JobId) => Promise<{ ok: boolean; error?: string }>
    // 清理指定会话全部已结束（completed/failed/killed）的后台长任务。
    clearSettledJobs: (sessionId?: string) => Promise<{ count: number }>
    // 读取指定后台长任务日志输出（支持 wait 阻塞或消费式增量）。
    readJobOutput: (
      jobId: JobId,
      wait?: boolean,
      timeoutMs?: number,
    ) => Promise<JobReadResult | null>
    // 查询当前会话装配的完整系统提示词与注入配置（执行流程面板展示用）。
    getPromptAssembly: (sessionId?: string, cwd?: string, tabId?: string) => Promise<PromptAssembly>
    // 编译 HTML 中使用的 Tailwind CSS 样式
    compileTailwind: (html: string) => Promise<string>
    // 保存并拆分前端设计文件到 ~/.lx/session/{sessionId}/design/{designId}/
    saveFrontDesign: (options: {
      sessionId: string
      designId: string
      html: string
      mode?: "tailwindcss" | "css"
    }) => Promise<{
      ok: boolean
      dir: string
      htmlPath: string
      cssPath: string
      jsPath: string
      error?: string
    }>
    // 打开指定前端设计本地目录
    openDesignDir: (sessionId: string, designId: string) => Promise<boolean>
    // 导出指定前端设计的预览图（PNG，全页、按档位宽度与主题）
    exportDesignPng: (options: ExportFrontDesignPngOptions) => Promise<ExportFrontDesignPngResult>
    onEvent: (handler: (event: AgentEvent) => void) => () => void
  }
}
