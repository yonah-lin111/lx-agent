import type { ModelSelection } from "@shared/settings"

// 消息内容块：文本。
export interface TextContent {
  type: "text"
  text: string
}

// 消息内容块：思考。
export interface ThinkingContent {
  type: "thinking"
  thinking: string
}

// 消息内容块：图片。
export interface ImageContent {
  type: "image"
  data: string
  mimeType: string
}

// 消息内容块：工具调用。
export interface ToolCall {
  type: "toolCall"
  id: string
  name: string
  arguments: Record<string, unknown>
  // question 工具的用户作答（执行完成时回填；随消息落库，供只读展示）。
  answers?: QuestionAnswer[]
}

// 模型停止原因。
export type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted"

// 模型调用 token 用量。
export interface Usage {
  input: number
  output: number
  // 缓存命中读取的输入 token（Anthropic cache_read_input_tokens）。
  cacheRead: number
  totalTokens: number
}

// 压缩摘要生成调用的 token 用量（输入=发给压缩模型的上下文，输出=摘要输出）。
export interface CompactionUsage {
  input: number
  output: number
}

// 用户消息指令来源元数据。
export interface UserMessageCommand {
  name: string
  kind: "builtin" | "prompt" | "skill"
  source?: "project" | "user"
}

// 用户消息。
export interface UserMessage {
  role: "user"
  content: string | (TextContent | ImageContent)[]
  timestamp: number
  // 是否为即时插话（steer 消息注入当前 run 的 turn 边界，用于视觉标识与区分）。
  isSteer?: boolean
  // 指令来源元数据（Prompt 模板、Skill 或 Slash 命令）。
  command?: UserMessageCommand
  files?: {
    name: string
    path: string
    type: "image" | "text"
    size?: string
    extension?: string
  }[]
}

// 助手消息。
export interface AssistantMessage {
  role: "assistant"
  content: (TextContent | ThinkingContent | ToolCall)[]
  provider: string
  model: string
  usage: Usage
  stopReason: StopReason
  errorMessage?: string
  timestamp: number
  durationMs?: number
}

// 上下文压缩摘要消息：可见的非交互块，标注"此处已压缩"。
// 不落 message entry（compaction entry 的 payload 即摘要）；UI 与模型上下文共用同一份。
export interface CompactionSummaryMessage {
  role: "compactionSummary"
  summary: string
  // 被压缩部分的估计 token 数（展示"压缩了多少"）。
  tokensBefore: number
  timestamp: number
  // 是否手动触发（/compact）；自动压缩不可经 /undo 撤销。
  manual: boolean
  // 压缩所使用的模型。
  model?: string
  // 压缩摘要生成调用的实际 token 用量（输入=发给压缩模型的上下文，输出=压缩模型输出）。
  usage?: CompactionUsage
  // 摘要本身的估计 token 数（压缩后的上下文规模）。
  summaryTokens?: number
}

// todo 清单项状态（对齐 Claude Code 四态）。
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

// 单个 todo 清单项。
export interface TodoItem {
  content: string
  status: TodoStatus
}

// todo 清单：整表替换语义（模型每次传完整数组，非增量 add/update）。
export type TodoList = TodoItem[]

// 任务清单状态消息：transformContext 每轮注入（模型上下文可见）。
// 不进入 state.messages（不落库、不渲染）；UI 走 todo_updated 事件 + restore 的 todos 字段。
export interface TodoStateMessage {
  role: "todoState"
  todos: TodoList
  timestamp: number
}

// 词级 diff 片段：文本 + 是否变更（变更片段渲染为逆色高亮）。
export interface DiffLinePart {
  text: string
  // 是否变更 token（渲染为逆色高亮）。
  changed: boolean
}

// diff 展示行。
export interface AgentDiffLine {
  type: "context" | "add" | "del"
  // 旧文件行号（context/del 行）。
  oldLine?: number
  // 新文件行号（context/add 行）。
  newLine?: number
  // 行内容。
  text: string
  // 单行替换的词级高亮片段（仅 add/del 行，纯渲染用）。
  parts?: DiffLinePart[]
}

// 结构化 diff 负载（edit/write 工具的展示副产品，随 ToolResultMessage 落库）。
export interface AgentDiff {
  // 被修改的文件路径（旧消息可能缺失，渲染端需容错）。
  fileName?: string
  lines: AgentDiffLine[]
  // 是否因变更行数超限截断（渲染端显示提示条）。
  truncated: boolean
  // 变更统计（全量，不受截断影响）。
  stats: {
    added: number
    removed: number
  }
}

// 子代理工具步骤（时间轴展示）。
export interface SubagentStep {
  toolName: string
  args: Record<string, unknown>
  // 结果摘要（成功文本）或错误信息。
  result?: string
  status: "running" | "done" | "error"
}

// 子代理面板数据（task 工具产物；随 ToolResultMessage 落库，恢复后重建弹窗）。
export interface SubagentData {
  // AI 分发的子代理名（缺失时回退 "task"）。
  name: string
  // 任务描述（task 输入）。
  description: string
  // 委托任务全文（task 输入）。
  prompt: string
  // 子代理完整内部上下文（弹窗展示真相源，含工具/MCP/skill/文本）。
  messages: AgentMessage[]
  // 工具步骤（时间轴展示；含内部工具/思考/MCP/skill 调用）。
  steps: SubagentStep[]
  // 聚合 token 用量。
  usage: Usage
  // 最终输出超限时完整结果落盘路径。
  filePath?: string
}

// LSP 语义检索操作（lsp 工具）。
export type LspOperation =
  | "goToDefinition"
  | "findReferences"
  | "hover"
  | "documentSymbol"
  | "workspaceSymbol"
  | "goToImplementation"
  | "prepareCallHierarchy"
  | "incomingCalls"
  | "outgoingCalls"

// LSP 结果位置（供渲染跳转；行/列为 1 起始，filePath 为绝对路径）。
export interface LspLocationResult {
  filePath: string
  line: number
  character: number
  // 签名或符号名（位置型结果无自然名称时为空串）。
  label: string
}

// lsp 工具结构化结果（随 ToolResultMessage 落库，恢复后渲染块复用跳转）。
export interface LspToolDetails {
  operation: LspOperation
  // 请求目标文件（绝对路径）。
  filePath: string
  // 请求位置（1 起始）。
  line: number
  character: number
  // workspaceSymbol 的搜索查询。
  query?: string
  // hover 等文本型结果的正文（无位置行时 results 为空数组）。
  text?: string
  results: LspLocationResult[]
  error?: string
}

// 工具结果消息。
export interface ToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: (TextContent | ImageContent)[]
  isError: boolean
  timestamp: number
  // 工具执行耗时（毫秒）。
  durationMs?: number
  // 工具执行的可视化 diff（edit/write 工具产物，供渲染与落库）。
  diff?: AgentDiff
  // 子代理面板数据（task 工具产物，供渲染与落库）。
  subagent?: SubagentData
  // LSP 检索结果（lsp 工具产物，供渲染与落库）。
  lsp?: LspToolDetails
}

// Agent 消息联合类型。
export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | CompactionSummaryMessage
  | TodoStateMessage
  | ToolResultMessage

// 建议问题生成请求的对话上下文消息。
export interface SuggestedQuestionContextMessage {
  role: "user" | "assistant"
  content: string
}

// 权限确认模式（对齐 Claude Code 权限体系三态）。
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions"

// 权限配置（~/.lx/config.json 的 agent.permissions 节点）。
export interface PermissionSettings {
  defaultMode: PermissionMode
  allow: string[]
  deny: string[]
  ask: string[]
}

// 权限请求（main → renderer，命令面板展示）。
export interface PermissionRequest {
  requestId: string
  toolName: string
  args: unknown
  summary: string
  mode: PermissionMode
  sessionId: string | null
}

// 权限决策（不含 requestId；主进程挂起请求的内部语义）。
// allowAll：会话级"允许全部工具"，跳过规则与弹窗，随会话切换重置。
// permanent：写回配置 allow[]/deny[]（精确参数），同工具同参数后续不再询问/直接拒绝。
export type PermissionDecision = {
  decision: "allow" | "deny"
  rememberForSession?: boolean
  allowAll?: boolean
  permanent?: boolean
}

// 权限决策（renderer → main 响应负载）。
export interface PermissionResponse {
  requestId: string
  decision: "allow" | "deny"
  rememberForSession?: boolean
  allowAll?: boolean
  // 永久允许/拒绝写回配置（allowAll 不写回）。
  permanent?: boolean
}

// 提问选项（question 工具选择题的候选项）。
export interface QuestionOption {
  label: string
  description?: string
}

// 单个提问（question 工具）。
export interface QuestionPrompt {
  // 简短纯文本提问（提交列表只读展示与答案回灌）。
  question: string
  // 附加 markdown 内容（可含 mermaid 图自动渲染），仅交互表单展示，不在已提交问题列表重复出现。
  content?: string
  // 短标签 chip（≤12 字符），UI 展示用。
  header?: string
  // 选择题候选（2..4 个）；缺省为自由文本输入。
  options?: QuestionOption[]
  // 多选（仅选择题生效）。
  multiSelect?: boolean
}

// 提问请求（main → renderer，渲染于消息流内的 question 工具调用块）。
export interface QuestionRequest {
  requestId: string
  // 触发本提问的 question 工具调用 id（renderer 据此定位消息流内的工具块）。
  toolCallId: string
  questions: QuestionPrompt[]
  sessionId: string | null
}

// 单个提问的答案（answer 恒数组：单选/自由文本长度 1，多选多值）。
export interface QuestionAnswer {
  question: string
  answer: string[]
}

// 提问响应（renderer → main；dismissed=true 表示用户关闭未作答）。
export type QuestionResponse =
  | { requestId: string; answers: QuestionAnswer[] }
  | { requestId: string; dismissed: true }

// 助手消息流式增量事件。
export type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "done"; reason: StopReason; message: AssistantMessage }
  | { type: "error"; reason: StopReason; error: AssistantMessage }

// Agent 运行生命周期事件（main → renderer 的唯一流式负载）。
export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_update"
      toolCallId: string
      toolName: string
      args: unknown
      partialResult: unknown
    }
  | {
      type: "tool_execution_end"
      toolCallId: string
      toolName: string
      result: unknown
      isError: boolean
      durationMs?: number
    }
  | { type: "mcp_status_changed"; servers: McpServerStatusItem[] }
  | { type: "session_title"; sessionId: string; title: string | null }
  | { type: "permission_request"; request: PermissionRequest }
  | { type: "question_request"; request: QuestionRequest }
  // 上下文压缩完成：同一次压缩以 compactionId 关联 loading 占位与可见摘要（摘要不落 message entry）。
  | {
      type: "compaction_summary"
      compactionId: string
      message: CompactionSummaryMessage
    }
  // 上下文压缩开始（摘要生成进行中，耗时数秒）：renderer 追加对应 loading 占位并禁止发送。
  | { type: "compaction_start"; compactionId: string; manual: boolean; model?: string }
  // 上下文压缩失败（摘要生成失败/超时）：renderer 仅移除对应 loading 占位并恢复发送。
  | { type: "compaction_failed"; compactionId: string; manual: boolean }
  // 上下文容量快照：当前会话估计 token 与压缩窗口（agent_end / 压缩 / 删除 / 恢复后推送，驱动状态栏百分比）。
  | { type: "context_usage"; tokens: number; contextWindow: number }
  // 任务清单更新：模型经 todowrite 整表替换（renderer 驱动状态栏 todo 指示；不落 message entry）。
  | { type: "todo_updated"; todos: TodoList }
  // 排队消息计数与内容变化（入队/每条出队/清空时推送；renderer 订阅维护权威计数，messages 供 tooltip 展示）。
  | { type: "queue_changed"; length: number; messages: string[] }
  // 后台长任务生命周期事件（JobRegistry 驱动，支持抽屉与状态指示器实时刷新）。
  | { type: "job_started"; job: JobSnapshot }
  | { type: "job_output_chunk"; jobId: JobId; chunk: string }
  | { type: "job_settled"; job: JobSnapshot }

// 后台任务唯一标识（会话内自增：bash-1, bash-2 等）。
export type JobId = string

// 任务类型与生命周期状态。
export type JobKind = "bash" | "subagent"
export type JobStatus = "running" | "stopping" | "completed" | "killed" | "failed"

// 任务快照（面向 UI 与模型工具只读展示）。
export interface JobSnapshot {
  id: JobId
  kind: JobKind
  label: string
  status: JobStatus
  detail?: string
  startedAt: number
  finishedAt?: number
  pid?: number
  sessionId: string
  outputLimitBytes?: number
}

// 任务读取结果。
export interface JobReadResult {
  text: string
  job: JobSnapshot
  hasMore: boolean
}

// Prompt 模板条目（由 promptTemplateLoader 扫描自 ~/.lx/prompts 与 <cwd>/.lx/prompts）。
export interface PromptTemplateItem {
  name: string
  description: string
  argumentHint?: string
  source: "project" | "user"
  filePath: string
}

// 会话归属上下文（发送消息时声明；决定会话建在哪个桶内）。
export interface AgentSendContext {
  projectItemId?: string // 项目 item 会话归属
  projectId?: string // 冗余：项目 id（聚合某项目全部 item 会话）
  page?: string // 非 item 会话的路由（'/' | '/project' | '/settings' …）
  cwd?: string // 工具执行目录（项目页 = project.path；独立页可省略，回退主目录）
  files?: {
    name: string
    path: string
    type: "image" | "text"
    size?: string
    extension?: string
  }[]
}

// 系统提示词分段装配结果。
export interface AssembledSection {
  name: string
  text: string
}

// 运行时上下文注入结果。
export interface AssembledContext {
  name: string
  text: string
}

// 系统提示词装配输出结构（系统提示词、指令文件、技能、环境变量与工具全集）。
export interface PromptAssembly {
  sections: AssembledSection[]
  contexts: AssembledContext[]
  variables: Record<string, string | undefined>
  activeTools?: string[]
  rendered: string
}

// 会话能力快照（随会话冻结）。
export interface AgentCapabilitySnapshot {
  tools: string[]
  mcp: string[]
  skills: string[]
}

// MCP server 连接状态（全局状态 icon 展示）。
export interface McpServerStatusItem {
  name: string
  status: "connected" | "disabled" | "failed"
}

// LSP server 包安装状态（状态栏指示；按 npm 包粒度）。
export interface LspServerStatusItem {
  packageName: string
  installed: boolean
}

// 批量安装缺失 LSP server 的结果。
export type LspInstallResult = { installed: string[]; failed: string[] }

// 会话摘要（历史列表展示，不含消息体）。
export interface AgentSessionSummary {
  id: string
  title: string
  cwd: string
  // 所属项目（历史面板项目 tag 客户端筛选用；独立页会话为 null）。
  projectId: string | null
  createdAt: string
  updatedAt: string
}

// 恢复的会话内容。
export interface AgentRestoredSession {
  messages: AgentMessage[]
  activeCapabilities: AgentCapabilitySnapshot
  // 任务清单（最后一条 todo entry 快照；空数组 = 无清单）。
  todos: TodoList
}

// 发送消息选项。
// delivery: "queue"（默认，当前 run 结束后排队执行）| "steer"（即时插话，注入当前 run 的 turn 边界即时引导转向）。
export interface AgentSendOptions {
  delivery?: "queue" | "steer"
}

// 发送对话请求的返回结果；ok 时携带落库会话 id（首条消息才真正入库）。
// queued 变体：流式输出期间消息已入队，当前 run 结束后自动发送；会话 id 即当前会话（流式中必有会话）。
// steered 变体：流式输出期间即时插话，已注入当前 run 的 turn 边界。
export type AgentSendResult =
  | { ok: true; sessionId: string }
  | { ok: true; queued: true; queueLength: number; sessionId: string }
  | { ok: true; steered: true; sessionId: string }
  | { ok: false; error: string }

// 切换会话工作区（/gitWorktree）的返回结果。
export type AgentSwitchWorktreeResult = { ok: true } | { ok: false; error: string }

// 手动压缩（/compact）的返回结果。
export type AgentCompactResult = { ok: true } | { ok: false; error: string }

// 撤销手动压缩（/undo 对压缩摘要触发）的返回结果；自动压缩不可撤销。
export type AgentUndoCompactionResult = { ok: true } | { ok: false; error: string }

// 会话分支（fork）的返回结果；ok 时携带新会话 id（创建后自动切换）。
export type AgentForkResult = { ok: true; sessionId: string } | { ok: false; error: string }

// 上下文容量快照（状态栏展示：估计 token / 模型窗口）。
export interface AgentContextUsage {
  tokens: number
  contextWindow: number
}

// 导出会话选项。
export interface ExportSessionOptions {
  sessionId?: string
  format: "html" | "markdown" | "jsonl"
  customPath?: string
  openAfterExport?: boolean
}

// 导出会话结果。
export type ExportSessionResult =
  | { ok: true; filePath: string; canceled?: false }
  | { ok: true; canceled: true }
  | { ok: false; error: string }

// 复制会话选项。
export interface CopySessionOptions {
  sessionId?: string
  target?: "markdown" | "last_assistant"
}

// 复制会话结果。
export type CopySessionResult = { ok: true; text: string } | { ok: false; error: string }

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
    continue: () => Promise<AgentSendResult>
    // 切换当前会话工作区：更新会话工具执行目录（cwd），下次装配按新目录重建工具集。
    switchWorktree: (path: string) => Promise<AgentSwitchWorktreeResult>
    // 手动触发上下文压缩（/compact）：摘要化早期历史并建立新边界；设置禁用/无可压缩内容时返回原因。
    compact: () => Promise<AgentCompactResult>
    // 撤销最后一次手动压缩（/undo 对压缩摘要触发；自动压缩不可撤销）。
    undoCompaction: () => Promise<AgentUndoCompactionResult>
    abort: () => Promise<void>
    restore: (messages: AgentMessage[]) => Promise<void>
    listSessions: () => Promise<AgentSessionSummary[]>
    restoreSession: (sessionId: string) => Promise<AgentRestoredSession>
    renameSession: (sessionId: string, title: string) => Promise<void>
    deleteSession: (sessionId: string) => Promise<void>
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
    getContextUsage: (selection?: ModelSelection) => Promise<AgentContextUsage>
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
    getPromptAssembly: (sessionId?: string, cwd?: string) => Promise<PromptAssembly>
    onEvent: (handler: (event: AgentEvent) => void) => () => void
  }
}
