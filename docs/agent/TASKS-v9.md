# Agent 与 Harness 继续实施任务文档（v9：Prompt Templates 提示词模板系统与 Slash 动态命令补全）

本文是"继续实行 agent 功能和 harness"的**任务文档 v9**。v1–v8 已全部落地合并入 `dev`（v8 实现了 Steer 即时插话与 Esc 快捷键分级打断）；本轮依据参考项目 [pi-main]（`packages/coding-agent/src/core/prompt-templates.ts` 的模版加载与参数宏替换机制、`packages/coding-agent/src/core/slash-commands.ts` 动态命令体系），经 Grill Me 决策闭环，确定本轮范围 = **Prompt Templates 模板系统 + Slash 动态命令补全（唯一）**，含明确不做项与实施规范。

参考既有文档：核心架构见 [design.md](./design.md)，扩展体系见 [extensions.md](./extensions.md)，Harness 演进与信任模型见 [harness.md](./harness.md)，SQLite 落盘见 [database.md](./database.md)，上一轮见 [TASKS-v8.md](./TASKS-v8.md)。

---

## 1. 背景与范围决策

### 现状分析（代码核验）

1. **Prompt Templates 缺失**：
   - 现仅有 Skill 体系（`skills/skillLoader.ts`），注入的是 system prompt 指令与 `read_skill` 工具；
   - 缺少对用户端常用宏命令/提示词模板的支持（如 `/review`, `/test`, `/refactor` 带有 `$1`, `$@` 参数展开的用户 prompt 宏）。
2. **Slash 命令面板硬编码**：
   - `AgentInputCommandPanels.tsx:77` 硬编码了 6 个内置命令（`/clear`, `/undo`, `/steer`, `/model`, `/gitWorktree`, `/compact`）；
   - 面板未支持动态读取用户/项目级 Prompt 模板或已扫描的 Skills 进行命令补全。
3. **扩展机制已就绪**：
   - `agentRunner.ts:447` 已有 `_expandSkillCommand` 在 main 侧展开显式指令；
   - `AgentMarkdownInput.tsx` 已具备 `@` 文件提及、`/` 命令弹窗与 `/model` 弹窗的基础结构。

### 范围决策（Grill Me 已闭环）

| # | 能力 | 结论 |
|---|------|------|
| **T** | **Prompt Templates 模板引擎**（`~/.lx/prompts/` 与 `<cwd>/.lx/prompts/`，支持 `$1`, `$@`, `${1:-default}` 参数宏替换） | **本轮做（主）** |
| **S** | **Slash 动态命令补全**（融合内置命令、Prompt Templates 模版与 `/skill:<name>` 显式调用，扁平单列表 + 来源微标签 Tag + 统一模糊匹配） | **本轮做（主）** |
| E | 会话多格式导出（Export HTML / Markdown / JSONL） | 不做（顺延至 v10） |
| C | Token 缓存与成本统计 (Cache Stats) | 不做（排后续） |
| F | 会话全文搜索 (FTS5) | 不做（维持） |
| R | run 恢复 (resume / durable log) | 不做（维持） |

---

## 2. Prompt Templates 模版引擎设计（Main 进程）

### 2.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | **存储路径与优先级** | 双来源：全局 `~/.lx/prompts/*.md` + 项目 `<cwd>/.lx/prompts/*.md`；**同名时项目级优先覆盖全局级（Project Overrides User）** |
| 2 | **模板文件格式** | 兼容 Markdown Frontmatter（对齐 pi-main）：<br/>`---`<br/>`description: 模板功能简述（≤60 字符）`<br/>`argument-hint: 参数提示（如 [target_file]）`<br/>`---`<br/>正文包含 `$1`, `$2`, `$@` 等参数占位符 |
| 3 | **参数宏解析语法** | - `$1`, `$2` ...：位置参数（支持双引号/单引号包含空格的 bash 风格参数解析）；<br/>- `$@` / `$ARGUMENTS`：全部后续参数文本；<br/>- `${N:-default}`：缺失或为空时采用默认值；<br/>- `${@:N}` / `${@:N:L}`：参数切片语法；<br/>- 未提供的参数占位符自动解析为空字符串 |
| 4 | **展开与落盘时机** | **Main 进程自动宏展开（模式 A）**：在 `agentRunner.send()` 收到文本时，先匹配模板并展开为完整 Prompt，再提交给 `agent.prompt(expanded)`；落盘会话历史记录真实展开后的有效 Prompt，输入框保持轻量短命令 |
| 5 | **IPC 契约** | 新增 `agent:listPromptTemplates` invoke 通道：返回 `{ name, description, argumentHint?, source: "project" | "user", filePath }[]` |

### 2.2 实现要点

- **`src/main/agent/prompts/promptTemplateLoader.ts`**（新）：
  - `load(cwd): LoadedPromptTemplate[]`：扫描全局与项目目录，解析 Frontmatter，按 Project > User 优先级去重并排序；
  - `parseCommandArgs(argsString: string): string[]`：解析命令行参数（尊重引号）；
  - `substituteArgs(content: string, args: string[]): string`：执行宏替换；
  - `expandPromptCommand(text: string, cwd?: string): string`：统一命令展开入口。
- **`src/main/agent/agentRunner.ts`**：
  - 在 `runOne()` 与 `continue()` 中调用 `expandPromptCommand`（与 `_expandSkillCommand` 合流或串联）。
- **`src/shared/contracts/agent.ts` & `src/shared/ipc/agentChannels.ts`**：
  - 新增 `PromptTemplateItem` 类型与 `AGENT_CHANNELS.listPromptTemplates` 常量。

---

## 3. Slash 动态命令补全设计（Renderer 进程）

### 3.1 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | **融合呈现模式** | **扁平统一列表 + 来源微标签 Tag + 统一模糊匹配（选项 A）**：统一使用键盘 ↑↓ 循环切换高亮与 Enter 补全；每项右侧打上 Tag：`内置`、`项目`、`全局`、`Skill` |
| 2 | **补全内容行为** | - 选中内置命令（如 `/clear`）：直接执行命令或回填；<br/>- 选中 Prompt 模板（如 `/review`）：回填 `/<name> ` 并将光标置于末尾，输入框上方或占位提示 argument-hint；<br/>- 选中 Skill（如 `ego-browser`）：回填 `/skill:ego-browser ` |
| 3 | **刷新与加载时机** | 输入框打开或切换项目/会话时异步拉取 `listPromptTemplates` 与可用 Skills 缓存，输入 `/` 时本地内存毫秒级模糊过滤 |

### 3.2 实现要点

- **`AgentInputCommandPanels.tsx`**：
  - 扩展 `AgentInputCommand` 类型支持 `kind: "builtin" | "prompt" | "skill"`、`source?: "project" | "user"`、`argumentHint?: string`；
  - 渲染带来源 Tag 的命令项（支持自定义 tag 颜色，如项目模板使用 `emerald`，全局模板使用 `blue`，Skill 使用 `violet`）。
- **`AgentMarkdownInput.tsx`**：
  - 动态聚合 `builtinCommands` + `promptTemplates` + `skills`；
  - 完善 Tab / Enter 补全选中命令与参数提示逻辑。

---

## 4. 实施规范与验证

1. **工作区隔离**：
   - 在 `.worktrees` 目录下新建隔离工作区：`时间戳-v9-prompt-templates`；
   - 严禁在 `dev` 分支直接修改代码，全部开发与测试在工作区内闭环。
2. **精确校验**（受影响范围）：
   - `pnpm typecheck`：确保跨进程 DTO 与组件 props 无类型破损；
   - Biome format：规范修改文件；
   - Vitest 单测：
     - `test/main/agent/prompts/promptTemplateLoader.test.ts`：覆盖 Frontmatter 解析、Project > User 覆盖优先级、bash 风格引号参数解析、`$1`/`$@`/`${N:-default}` 占位符替换；
     - `test/main/agent/runner/`：覆盖 runner 命令展开与发送流程。
3. **交付与合并**：
   - 任务完成后，按规范汇报已完成内容、验证结果、风险与下一步，并询问用户是否合并到 `dev` 分支。
