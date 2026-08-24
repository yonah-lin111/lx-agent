# 会话运行时与治理

定义 Agent 会话的动态行为：生命周期、输入队列与插话、会话管理、子代理、上下文治理（压缩/修剪/spill/守卫/看门狗）、后台作业、提示词装配与导出。

架构与 IPC 见 [architecture.md](./architecture.md)；工具契约见 [tools.md](./tools.md)；权限门控见 [permissions.md](./permissions.md)；落盘结构见 [database.md](./database.md)。

## 1. 会话生命周期

一次 `send()` 的完整路径：

1. 输入校验 → 流式中转入队/steer（§2），否则进入 run。
2. `mcpManager.ensureConnected()`（幂等）→ 新会话冻结归属（project item / page）、cwd、能力快照；空会话仅内存态，**首次发消息才建会话行**。
3. `ensureReady()` 装配 Agent：systemPromptManager 分层装配 + skill/instruction 注入 + ToolRegistry 激活（能力指纹变化才重建）。
4. 命令展开：`/skill:<name> args` 展开正文块；prompt 模板宏展开为完整 prompt（落盘展开后的有效文本）。
5. `beginTurn` 捕获本轮落盘输入 → 首条消息建会话行 + 触发标题生成 → `agent.prompt(expanded)`。
6. turn 结束：`flushTurn` 单事务落库（消息 entries + agent_call 行 + todo entry，同步 updated_at）→ 队列 drain（§2）→ 按需压缩（§10）。
7. busy（run 未结束）不发生：send 在流式中总是入队或 steer；权限请求挂起期间发送被拒绝（权限面板独占键盘）。

错误语义：无 defaultModel / apiKey 缺失 → send 返回明确 error，renderer toast 引导设置页；首轮 prompt 失败且会话无消息落库 → 删除刚建的空会话行。

## 2. 输入队列与即时插话

| 机制 | 行为 |
|------|------|
| queue（排队） | 流式中 Enter 发送 → 入队返回 `{ ok, queued, queueLength }`，输入框清空并显示「已排队 N 条」提示条（hover 列出各条原文）；当前 run 结束后 FIFO 逐条作为**独立 user turn** 自动发送 |
| 队列边界 | 上限 **20** 条（超限报错不覆盖）；stop 清空队列；模型单轮错误只结束该轮、drain 继续；新建/切换/恢复/fork/删除会话、worktree 切换均清空（内存态不落库） |
| drain 细节 | `queue_changed { length, messages }` 事件驱动计数；drain 自动发送的消息标记 `isQueuedDrain`，不触发「平滑滚动到底」 |
| steer（插话） | 流式中 Shift+Enter 或 `/steer <text>` → `agent.steer()` 在 turn 边界注入当前 run，立即转向；user 消息带 `isSteer: true` 落库渲染微标签；无运行中 agent 时退化为普通 send |
| Esc 分级打断 | ① 补全/命令面板激活 → 关闭面板；② 有未发送草稿 → 清空草稿；③ 空输入且流式中 → abort（清队列）；④ 非聚焦输入框时全局 Esc 同样触发 abort |

`continue()`：最后一条 assistant stopReason 为 `length`/`aborted` 且有文本时可续写——先 `agent.continue()`，必要时以可见 user 气泡注入续写指令后 continue；结束后同样 kick drain。

## 3. 会话管理

- **列表/恢复**：全量 `ORDER BY updated_at DESC`（归属列仅作项目 tag 客户端筛选）；应用启动恢复最近活跃会话。`restoreSession` 按 seq 升序重建 messages（损坏 entry 跳过）、取最近能力快照、MCP/skill 按当前配置重载、cwd 用会话冻结值。
- **重命名**：AI 标题生成与手动改名共用，标题 ≤40 字符。
- **删除会话**：级联删 entries/calls/snapshots（FK CASCADE）；当前会话先脱离；同时清理该会话 spill 目录与后台作业。
- **删除一轮**（deleteMessageTurn）：按用户轮 timestamp 定位 message entry，删至下一用户轮前的全部 message/todo entry 与关联 agent_call；`compaction` entry 是独立边界不随轮删；删除区间若带走最新 todo 则重读回退；UI-only 幽灵轮仅本地移除；删除后会话为空则连会话行一并删除；seq 保留空洞，nextSeq 取 MAX+1。
- **fork（从此分支）**：从任意用户轮切割——复制 `seq < forkSeq` 的全部 entry 到新会话（**保持原始 seq**、parent_id 重映射、同事务），切割点轮从空白重写；继承 cwd 与 `agent_snapshot` 行（≤ 切割点）；切割点落入压缩区（seq < firstKeptSeq）或源会话 busy 时拒绝；命名 `源标题 (fork #N)` 递增；创建后自动切换。
- **git 快照回滚**：cwd 是 git 仓库时每 turn 两次 write-tree（hash_start/hash_end）存 `agent_snapshot`（隐藏快照库经 alternates 复用真实 object DB，不动用户 index）；删除一轮且其为**最后一轮**时按 files_changed 选择性回滚到 hash_start；中段轮仅删消息；非 git 项目静默降级。
- **worktree 切换**（switchWorktree）：切换后清空输入队列，会话上下文随之重载。

## 4. 标题生成与建议问题

- **标题**：新建会话首条消息 fire-and-forget 触发（`ai.titleSummary` 模型，缺省回落 defaultModel）；裸 streamText 单次生成、10s 超时、简体中文 ≤20 字；失败静默保留兜底标题；`session_title` 事件两态：`null` = pending（历史面板 pulse 占位）/ string = done（写库前校验会话归属防竞态）。
- **建议问题**：最后一条 AI 回答正常结束后异步生成（`suggestedQuestions` invoke），`SuggestedQuestions` 组件可直接发送或回显输入框。

## 5. 子代理（task 工具）与面板

- **执行模型**：进程内嵌套 `Agent` 实例——独立 systemPrompt（父提示词 + 子代理前缀）、独立 messages、工具集 = 父激活集**去掉 task 自身**（斩断递归）；复用父 abort signal（级联中止）与同一 permissionManager 门控；并行来自父循环 executionMode，批量下发即并发。
- **权限**：`task` 进门控集（spawn 前确认）；内部工具照常门控不豁免。
- **provenance 落库**：子代理内部每次工具调用写一行 `agent_call`（`parent_call_id` 指向父 task 调用行、`entry_id` 恒 null），父树只落一个 toolCall/toolResult 对；递归 CTE 沿 parent_call_id 查子树（见 database.md §2.3）。
- **快照与面板**：task 工具维护完整运行快照 `{ name, description, prompt, messages, steps, usage }` 经 details 回传，随 `ToolResultMessage.subagent` 落库——恢复会话后面板内容可完整复现。`AgentSubagentBlock` 展示名称/统计/状态，点击打开 `AgentSubagentPanel`（顶部向下展开弹层，readOnly 复用 `AgentMessageItem` 渲染完整内部时间轴；滚动按钮目标自动切换到面板列表）。

## 6. Spill 大输出落盘（spill/spillManager.ts）

- 触发：read/grep/bash/webfetch 等输出超 `DEFAULT_MAX_LINES`(2000)/`DEFAULT_MAX_BYTES`(50KB) 时，完整原文写入 `~/.lx/spill/<sessionId>/<callId>.txt`。
- 回灌：截断预览 + 尾部提示块（展示总行数/字节数对比、落盘绝对路径、"Use 'read' tool with offset/limit"指引）；模型可分片读取全文。
- 生命周期：会话删除级联清理目录；应用启动清理 TTL 7 天的孤立文件。

## 7. 写后 LSP 自动诊断（lsp/feedback.ts）

edit/write 成功写入后调用 lspManager 探测修改文件诊断，超时 2000ms：

- **静默优先**：仅存在 `error` 级诊断时在 toolResult 尾部追加摘要块；clean / 仅 warning / LSP 不可用 / 超时一律静默成功，不污染上下文。
- 复用既有 lspManager 与语言映射，零额外配置；绝不阻断写入与主循环。

## 8. 后台作业（jobs/jobRegistry.ts）

使 `npm run dev` 等长任务不阻塞对话循环。

- **注册表**：进程内单例 `LocalJobRegistry`，以 sessionId 隔离；状态机 `running → stopping → killed / completed / failed`；会话删除级联 SIGTERM 全部存活作业并清理 spill。
- **启动**：bash 工具 `background: true` → detached 子进程组立即返回 job id（`bash-1`…）与使用指引；每会话并发上限治理，超限明确报错。
- **输出**：64KB 内存缓冲 + 超限实时落盘 `~/.lx/spill/<sessionId>/jobs/<jobId>.log`；`job_output { job_id, wait?, timeout_ms? }` 以消费游标读增量（wait 可阻塞等待新输出或进程退出，默认 10s 上限 60s）；已终结作业幂等读终值。
- **管控工具**：`job_output` / `job_list` / `job_kill`（SIGTERM → 超时 SIGKILL 进程树）；IPC：listJobs / killJob / removeJob / clearSettledJobs / readJobOutput。
- **事件与 UI**：`job_started` / `job_output_chunk` / `job_settled` 推送；状态栏 `JobStatusButton` 计数徽标 + `AgentJobsMonitorView` 监控抽屉（实时日志 / 手动 Kill / 清理已结束）。

## 9. 任务清单（todo）

- 模型经 `todowrite` 整表替换维护四态清单（pending/in_progress/completed/cancelled）；多步任务由系统提示词指引自动建单。
- 落库：追加型 `todo` entry（后写覆盖前写，恢复读最后一条；随轮删除回退）。
- 上下文：`transformContext` 在清单非空时注入 `[任务清单]` 消息保持跨轮同步；不入 state.messages。
- UI：`todo_updated` 事件驱动状态栏 `TodoStatusButton` 与消息流 `AgentTodoCallBlock`；dock 只读，唯一写者是模型。

## 10. 上下文治理

五层机制，全部非破坏性（SQLite 原始记录不变）：

### 10.1 Compaction 结构化压缩（compaction.ts + contextCompactor.ts）

- **方案 Z（可见摘要 + 全量真相）**：state.messages 保持全量（UI 可回看、DB 全量落盘）；模型上下文经 transformContext 构造为 `[compactionSummary 可见摘要] + firstKeptSeq 之后尾部`。
- **边界存储**：`compaction` entry payload `{ summary, firstKeptSeq, tokensBefore }`；恢复时重建边界。
- **触发**：turn 结束后估计 token > `contextWindow - reserveTokens` 即压缩；配置 `ai.compaction`（默认 enabled=true / contextWindow=128000 / keepRecentTokens=20000 / reserveTokens=16384）。token 估计锚定最近一次 usage.totalTokens，其后 char/4 累加；切割点只落在完整 turn 边界。
- **手动入口**：`/compact`（compact channel）+ `undoCompaction` 回退。
- **溢出自愈**：provider 报 context overflow（`isContextOverflowFailure`）→ 移除错误消息 → 强制压缩 → 同一 prompt 自动重试一次，仍失败则报错。
- **事件**：`compaction_start { manual, model? }` / `compaction_summary` / `compaction_failed` / `context_usage { tokens, contextWindow }`（状态栏容量显示）。

### 10.2 Tier-1 历史工具输出修剪（compaction/contextPruner.ts）

transformContext 内先于压缩执行：较早历史中超过行数/字符阈值的只读类工具输出（read/grep/find/ls/webfetch/webSearch）就地替换为占位文本（保留行数统计），最新 N 轮完整保留；纯内存视图变换。

### 10.3 Repeat Tool Guard 死循环守卫（guard/repeatToolGuard.ts）

- 指纹：参数 key 深度排序的规范化 JSON + 工具名 → `(toolName, canonicalArgs)`。
- 阶梯干预：连续相同调用达 `warningThresholds [3, 5]` 依次注入软性/强提醒（附次数与参数预览，上限 300 字符）；达 `blockThreshold 7` 直接拒绝执行并返回错误回灌模型。
- `transparentTools`（todowrite/question/task）不进入重复链计数；session 级计数器随会话切换清理。

### 10.4 流式空闲看门狗（stream/idleWatchdog.ts）

aiSdkStreamFn 内置：每个 chunk `feed()` 重置计时；默认 30s 无增量即 abort（错误标注 idle timeout）；与用户 abort 经 `AbortSignal.any` 合并；finally 中释放迭代器资源，杜绝半开连接挂死 run。

## 11. 提示词装配与执行流程面板

- **systemPromptManager**（prompts/systemPromptManager.ts）：分层装配 system prompt——sections（身份/通用行为层 behavior/persona/instructions/skills 等，带优先级）+ contexts（OS/cwd/git 分支/时间等运行时注入）+ variables（模板变量表）→ `rendered` 完整串；skill XML 块与 instruction 文件作为 section 注册，环境块作为 context 注册。
- **getPromptAssembly**：invoke 返回 `{ sections, contexts, variables, activeTools, rendered }`，供执行流程面板展示「系统到底看到了什么」。
- **执行流程面板**（AgentExecutionFlowList）：只读时间轴快照，`executionFlow.ts` 将会话消息 + PromptAssembly 投影为步骤序列（system / user / thinking / tool / subagent / compaction / assistant）；打开瞬间捕获快照隔离流式跳动，手动刷新；`scrollbar-gutter: stable` 防抖动。

## 12. 会话导出（export/）

- 格式：Markdown（frontmatter 元数据 + `<details>` 折叠工具调用）、JSONL（首行 header + 每行一条线性化消息，供评测/微调）、单文件 HTML（htmlTemplate：内嵌 CSS/JS，零外部依赖，离线双击可开，深浅主题 + 折叠交互）+ 剪贴板复制（全文 markdown / 最近一条回复）。
- 入口：`/export [html|md|jsonl]`、`/copy [all]` 命令与 UI 按钮；channels `exportSession` / `copySession`；默认保存 Downloads 并 `showItemInFolder` 定位。
- 边界：流式进行中禁用全量导出（避免读到未完结事务状态）。

## 13. 演进路线

| 方向 | 触发条件 | 留口位点 |
|------|----------|----------|
| 后台作业完成自动唤醒 run | 出现"任务完成后无人值守继续"的真实诉求 | onJobSettled 监听 + hooks 位点齐备 |
| node-pty 伪终端 | 需要交互式 TTY/ANSI 渲染 | jobRegistry 的 child_process 已隔离在单一模块 |
| compaction 多段/增量摘要 | 超长会话摘要质量不足 | compaction entry 结构可扩展 |
