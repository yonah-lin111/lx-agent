# Agent 与 Harness 继续实施任务文档（v11：工具执行保真度与诊断闭环 Spill 机制与写后 LSP 自动诊断）

本文是"继续实行 agent 功能和 harness"的**任务文档 v11**。v1–v10 已全部落地合并入 `dev`（v10 落地了多格式会话导出与分享系统 Export HTML / Markdown / JSONL）；本轮依据参考项目 [deepseek-harness-master]（`packages/spill` 的大输出落盘引用机制与 `packages/runtime-diagnostics` 的文件修改后自动挂载 LSP/Lint 诊断反馈闭环）与 [pi-main]（`output-accumulator.ts` 进程输出流控），经架构分析与边界规划，确定本轮范围 = **工具执行保真度与诊断闭环（Spill 大输出落盘引用 + `edit`/`write` 写后 LSP 自动诊断反馈）（唯一）**，并明确定义 **v12：后台长进程与终端 PTY 管理** 作为后续路线图（本轮不执行）。

参考既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)，上一轮见 [TASKS-v10.md](./TASKS-v10.md)。

---

## 1. 背景与范围决策

### 现状分析（代码与架构核验）

1. **工具输出硬截断导致关键信息丢失（In-memory Truncation）**：
   - 现状：`src/main/agent/tools/truncate.ts`（`DEFAULT_MAX_LINES = 2000`, `DEFAULT_MAX_BYTES = 50KB`）在 `read`、`grep`、`bash`、`webfetch` 等工具输出超限时，直接在内存中丢弃多余行或字节。
   - 缺陷：Agent 无法获取超出部分的任何信息，若要查看后文必须手动猜测 offset 或重新运行命令；若输出本身是不可复现的动态日志，数据将彻底丢失。
2. **写操作缺乏语法与类型反馈闭环（Blind File Mutations）**：
   - 现状：`edit.ts` 和 `write.ts` 在写入文件并生成 Diff 后即返回成功，Agent 无法在同一步骤内感知是否破坏了代码语法、引入了未定义符号或破坏了类型契约。
   - 缺陷：Agent 必须显式再次调用 `lsp` 工具或依靠用户提示才能发现错误，极大降低了复杂重构的成功率。
3. **缺少长期运行后台任务管理（顺延至 v12 规划）**：
   - 当前 `bash.ts` 是单次同步超时执行模型，无法优雅支持 `npm run dev`、测试监听或长编译任务。

### 范围决策

| # | 能力 | 结论 |
|---|------|------|
| **S** | **Spill 机制（超限输出落盘 + 上下文轻量预览与路径引用）** | **本轮做（主）** |
| **D** | **Post-Mutation LSP 自动诊断闭环（`edit`/`write` 写后即时错误反馈）** | **本轮做（主）** |
| P | 后台长进程与终端 PTY 管理 (Background Processes / PTY) | **列入 v12 路线图（本轮不执行）** |
| H | 统一生命周期 Hook / Extension 抽象 | 不做（避免 Electron 内部过度封装） |
| A | ACP 跨进程协议与微包架构 | 不做（维持 Electron IPC 单体清晰边界） |

---

## 2. 核心架构与数据流设计

### 2.1 Spill 机制（大输出落盘引用）

#### 数据结构与目录规范
- **存储路径**：`~/.lx/spill/<sessionId>/<callId>.txt`
- **生命周期**：
  - 绑定当前会话 `sessionId`；
  - 会话被删除时（`agentRunner.deleteSession`）级联清理对应目录 `~/.lx/spill/<sessionId>`；
  - 应用启动时执行轻量清理（清理 7 天前的孤立 spill 文件）。
- **截断与溢出判定**：
  - 维持 `maxLines`（默认 2000）与 `maxBytes`（默认 50KB）阈值；
  - 未超限时：返回原始内容，不落盘；
  - 超限时：将完整原始文本写入 `~/.lx/spill/<sessionId>/<callId>.txt`，返回包含头部或尾部截断的预览文本，并在末尾附加 Spill 提示块：
    ```text
    ... [截断内容] ...

    [Output truncated: Showing 2000 of 8420 lines (50.0KB / 320.5KB). Full output saved to: /Users/.../.lx/spill/<sessionId>/<callId>.txt. Use 'read' tool with offset/limit to inspect specific sections.]
    ```

### 2.2 Post-Mutation LSP 自动诊断闭环

#### 执行时序与反馈规范
```mermaid
sequenceDiagram
    participant Loop as agent-loop
    participant Tool as edit / write 工具
    participant FS as 磁盘文件系统
    participant LSP as lspManager (TypeScript/Python/etc.)

    Loop->>Tool: execute({ path, content/diff })
    Tool->>FS: 写入并校验变更
    Tool->>LSP: touchFile(path) & getDiagnostics(path, timeout=2000ms)
    alt LSP 返回 error 级别诊断
        LSP-->>Tool: [{ line: 42, col: 10, severity: "error", message: "Cannot find name 'foo'" }]
        Tool-->>Loop: 返回 "Successfully applied edits.\n\n[LSP Diagnostics after edit (1 error)]:\n- src/foo.ts:42:10: Cannot find name 'foo' (TS2304)"
    else 无 error（仅 warning / clean / 超时 / 无可用 LSP）
        Tool-->>Loop: 返回普通成功结果（静默通过，不污染上下文）
    end
```

#### 规则与边界
1. **静默优先**：只有在产生 `error` 级别（严重的语法或类型错误）时才追加诊断块；无报错或仅有无关 warning 时保持静默，不浪费 token。
2. **快速超时**：LSP 诊断调用强制 `Promise.race` 2000ms 超时保护；超时或语言服务器未启动时静默降级为普通成功，绝不阻断文件写入与 Agent 主循环。
3. **零额外配置**：复用项目既有的 `lspManager`，自动探测文件扩展名（`.ts`, `.tsx`, `.js`, `.py`, `.json`, `.css`, `.html` 等）。

---

## 3. 实现计划与代码改动清单

### Main 进程改动

1. **`src/main/agent/spill/spillManager.ts`**（新）：
   - `saveSpillFile(sessionId: string, callId: string, content: string): string`：落盘完整内容并返回绝对路径；
   - `cleanSessionSpill(sessionId: string): void`：清理会话临时文件；
   - `cleanStaleSpills(ttlDays?: number): void`：启动垃圾清理；
   - `wrapWithSpill(sessionId: string, callId: string, rawContent: string, truncationResult: TruncationResult): string`：生成统一的提示文本。
2. **`src/main/agent/tools/truncate.ts`**：
   - 增加支持 spill 上下文注入的可选参数与结构体扩展。
3. **`src/main/agent/tools/edit.ts` & `src/main/agent/tools/write.ts`**：
   - 注入可选 `lspManager` 依赖；在写入成功后异步探测 LSP 诊断，按规则附加至结果。
4. **`src/main/agent/assembly.ts` & `src/main/agent/agentRunner.ts`**：
   - 装配 `spillManager` 与 `lspManager` 到工具运行时中；
   - 在 `deleteSession` 时调用 `spillManager.cleanSessionSpill(sessionId)`。

---

## 4. 后续路线图规划：v12（后台长进程与终端 PTY 管理）

> [!NOTE]
> 本节仅作为架构路线图记录，不在 v11 任务中执行。

### 4.1 背景与目标
使 Agent 能够执行长耗时命令（如开发服务器 `npm run dev`、长编译任务、监控进程），而不阻塞 Agent 主对话流。

### 4.2 规划架构
1. **`src/main/agent/process/` 进程管理器**：
   - 维护后台进程注册表（`id`, `command`, `pid`, `status`, `outputBuffer`）；
   - 提供 `bash_background` 工具或扩展 `bash` 工具入参 `{ background: true }`；
   - 支持 `process_status`、`process_input`（向进程 stdin 发送控制字符或输入）、`process_kill`。
2. **Renderer 进程状态与 UI 面板**：
   - 顶部状态栏或侧边栏新增「后台进程监控」指示器；
   - 支持在抽屉中查看实时输出流，提供手动停止与重启操作。

---

## 5. 实施规范与验证

1. **Git 工作区隔离**：
   - 用户确认本任务后，在 `.worktrees/` 下新建工作区：`[时间戳]-v11-runtime-enhancement`；
   - 严禁直接在主仓库修改代码。
2. **精确校验**：
   - `pnpm typecheck`：验证主进程与工具类型契约无破损；
   - Vitest 单测覆盖：
     - `test/main/agent/spill/spillManager.test.ts`：测试大输出落盘、路径隔离、会话级清理与超时清理；
     - `test/main/agent/tools/lspDiagnosticsFeedback.test.ts`：测试 `edit`/`write` 在报错、干净、超时及 LSP 不可用时的诊断回填行为。
3. **交付与合并**：
   - 任务完成后按规范输出总结，并向用户确认是否合并到 `dev`。
