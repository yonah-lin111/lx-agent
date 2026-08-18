# Agent 与 Harness 继续实施任务文档（v10：会话多格式导出与分享系统 Export HTML / Markdown / JSONL）

本文是"继续实行 agent 功能和 harness"的**任务文档 v10**。v1–v9 已全部落地合并入 `dev`（v9 落地了 Prompt Templates 模版引擎与 Slash 动态命令补全）；本轮依据参考项目 [pi-main]（`packages/coding-agent/src/core/export-html/` 的单文件交互式 HTML 导出体系与 `agent-session.ts` 的 `exportToJsonl` / `exportToHtml` 序列化机制），经架构分析与边界规划，确定本轮范围 = **会话多格式导出与分享系统（Export HTML / Markdown / JSONL / /export 命令 / 复制会话）（唯一）**，含明确不做项与实施规范。

参考既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)，上一轮见 [TASKS-v9.md](./TASKS-v9.md)。

---

## 1. 背景与范围决策

### 现状分析（代码与架构核验）

1. **会话数据已全量落盘于 SQLite**：
   - `agentSessionService.ts` 已完整管理 `agent_session` 与 `agent_session_entry` 表，包含完整的 turns、工具调用（`agent_call`）、todo 清单与压缩摘要；
   - 恢复接口 `agentApi.restoreSession(sessionId)` 可随时拉取任意历史会话的全量 messages。
2. **缺乏外部共享与归档能力**：
   - 用户无法将与 Agent 的复杂排错/开发过程导出为可脱离 Electron 运行环境、独立在浏览器打开并交互的漂亮单文件 HTML 报告；
   - 无法一键导出标准 Markdown 供知识库（Notion / GitHub Issue / Obsidian）归档，亦缺少标准 JSONL 供微调与 Eval 评测。
3. **Slash 动态命令体系已在 v9 就绪**：
   - `AgentMarkdownInput` 与 `AgentInputCommandPanels` 已支持动态加载与补全命令，可天然扩展内置 `/export` 与 `/copy` 指令。

### 范围决策

| # | 能力 | 结论 |
|---|------|------|
| **E** | **会话多格式导出（HTML / Markdown / JSONL）与 `/export` / `/copy` 命令** | **本轮做（主）** |
| C | Token 缓存与成本统计 (Cache Stats) | 不做（顺延至 v11） |
| F | 会话全文搜索 (FTS5) | 不做（维持） |
| R | run 恢复 (resume / durable log) | 不做（维持） |
| P | refs 多分支可视化树 UI | 不做（维持） |

---

## 2. 导出引擎设计（Main 进程）

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | **HTML 导出架构** | **内嵌自包含单文件（Zero External Asset Dependency）**：HTML 模板直接内嵌 CSS、轻量 JS 折叠脚本与 Markdown 渲染能力，不依赖任何外部 CDN 或本地绝对文件路径，双击可在任意浏览器离线打开并完美呈现深浅主题 |
| 2 | **Markdown 导出格式** | 清晰结构化：头部 Frontmatter 元数据（会话标题、ID、创建时间、模型、CWD）+ 角色分级标题 + 代码块语法高亮标记 + 折叠式 `<details>` 包裹工具调用与执行结果 |
| 3 | **JSONL 导出格式** | 对齐标准 Session Dataset 规范：首行 Header 声明，后续每行对应一条线性化的 `AgentMessage` / `SessionEntry` JSON，保证通用性与反向导入潜力 |
| 4 | **文件保存与落地路径** | 支持双模式：① 默认保存至系统 Downloads 目录（带有时间戳与会话标题 slug），完成后调用 `shell.showItemInFolder` 定位或浏览器打开；② 支持传参指定目标路径或弹出 Electron 原生 `dialog.showSaveDialog` 供用户选取 |
| 5 | **IPC 契约** | 新增 `agent:exportSession` 与 `agent:copySession` invoke 通道 |

### 2.2 实现要点

- **`src/main/agent/export/sessionExporter.ts`**（新）：
  - `exportSessionToHtml(session: AgentRestoredSession, meta: AgentSessionSummary, options?: ExportOptions): Promise<string>`：将会话转换为单文件交互式 HTML；
  - `exportSessionToMarkdown(session: AgentRestoredSession, meta: AgentSessionSummary): string`：纯文本结构化 Markdown 转换器；
  - `exportSessionToJsonl(session: AgentRestoredSession, meta: AgentSessionSummary, filePath?: string): Promise<string>`：JSONL 线性导出器；
  - `copySessionToClipboard(session: AgentRestoredSession, format: "markdown" | "last_assistant"): string`：复制提取器。
- **`src/main/agent/export/htmlTemplate.ts`**（新）：
  - 维护现代单文件 HTML/CSS/JS 模板，支持工具调用折叠展开、代码一键复制、Token 消耗徽标与响应式排版。
- **`src/main/agent/agentRunner.ts`**：
  - 接入 exportSession 与 copySession 调度，通过 `agentSessionService` 提取历史记录或直接取当前内存态。
- **`src/shared/contracts/agent.ts` & `src/shared/ipc/agentChannels.ts`**：
  - 声明 `ExportSessionOptions`, `ExportSessionResult`, `CopySessionResult` 类型与对应的 IPC channel 常量。

---

## 3. 交互与 Slash 命令接入（Renderer 进程）

### 3.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | **命令交互入口** | - 输入 `/export` 或 `/export html` / `/export md` / `/export jsonl` 触发导出；<br/>- 输入 `/copy` 复制最近一条 AI 回复，`/copy all` 复制完整对话 Markdown 到剪贴板 |
| 2 | **UI 可视化入口** | 会话标题栏 / 更多操作菜单（`...`）新增「导出对话」二级选项（HTML 报告 / Markdown / JSONL）与「复制全文」；导出成功后通过 `LxToast` 弹出轻量提示并提供「在文件夹中打开」操作 |
| 3 | **流式中互斥安全** | 生成流式进行中（`isStreaming === true`）时禁用全量导出，防止读取未完结事务脏状态 |

### 3.2 实现要点

- **`AgentInputCommandPanels.tsx`**：
  - 内置命令列表追加 `/export`（支持 `argumentHint: "[html|md|jsonl]"`）与 `/copy`（支持 `argumentHint: "[all]"`）。
- **`AgentMarkdownInput.tsx`**：
  - 拦截 `/export` 与 `/copy` 命令，调用 `agentApi.agent.exportSession` / `agentApi.agent.copySession`。
- **`AgentPage.tsx` / `ChatHistoryPanel.tsx`**：
  - 在历史会话条目右键/悬浮菜单与主界面顶部操作区增加导出按钮。

---

## 4. 实施规范与验证

1. **Git 工作区隔离**：
   - 经确认后，在 `.worktrees` 目录下新建工作区：`时间戳-v10-session-export`；
   - 严禁直接在主仓库 `dev` 分支改动代码。
2. **精确校验**：
   - `pnpm typecheck`：验证主进程与渲染进程类型契约无破损；
   - Biome 格式化：保持代码品味与规范；
   - Vitest 单测：
     - `test/main/agent/export/sessionExporter.test.ts`：测试 HTML / Markdown / JSONL 生成器的结构完整性、特殊字符转义、工具调用折叠块生成与剪贴板文本提取。
3. **交付与合并**：
   - 完成后按规范输出总结，并向用户确认是否合并到 `dev`。
