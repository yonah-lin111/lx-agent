# 工具注册逻辑总结

## 核心文件

- `src/main/agent/assembly.ts` — 负责工具集的装配与系统提示词生成。
- `src/main/agent/tools/registry.ts` — `ToolRegistry` 类，工具的注册表实现。

## 工具注册流程

### 1. 内置工具全集 `ALL_TOOL_NAMES`

```ts
export const ALL_TOOL_NAMES = new Set([
  "read", "ls", "grep", "find", "write", "edit", "apply_patch",
  "bash", "time", "todowrite", "web_search", "webfetch",
  "task", "question", "render_svg", "render_ascii", "render_html",
  "lsp", "job_output", "job_list", "job_kill",
])
```

该集合定义了 Agent 可用的全部内置工具名称，作为激活时的白名单过滤基准。

### 2. `ToolRegistry` 结构

| 成员 | 类型 | 作用 |
|---|---|---|
| `tools` | `AgentTool<any>[]` | 注册的全部工具实例 |
| `activeNames` | `string[]` | 当前激活的工具名列表 |
| `cwd` | `string` | 工具执行的工作目录 |

核心方法：

- `register(tool)` — 将工具实例加入 `tools`，**不自动激活**。
- `setActive(names)` — 设定激活集，只有激活集中的工具会被模型调用。
- `getActive()` — 返回当前激活的完整工具实例列表。
- `getAll()` — 返回全部已注册工具实例。

### 3. `createRegistry` 装配函数

```ts
export const createRegistry = (
  cwd: string,
  activeTools: string[],
  mcpToolNames: string[],
  withReadSkill: boolean,
  taskDeps?: TaskToolDeps,
  questionDeps?: QuestionToolDeps,
  lspDeps?: LspToolDeps,
  sessionDeps?: SessionToolDeps,
): ToolRegistry
```

#### 注册阶段

**无条件注册**（cwd 相关工具，始终注册）：

- `read`, `ls`, `grep`, `find`, `write`, `edit`, `apply_patch`, `bash`
- `time`, `todowrite`, `render_svg`, `render_ascii`, `render_html`
- `web_search`, `webfetch`（无 cwd）
- `job_output`, `job_list`, `job_kill`
- `read_skill`（条件，见下方）

**按依赖条件注册**：

- `lsp` — 仅当传入 `lspDeps`
- `question` — 仅当传入 `questionDeps`
- `task` — 仅当传入 `taskDeps`；注册时传入 `getTools` 回调，指向 `registry.getActive().filter(tool => tool.name !== "task")`，斩断递归
- `read_skill` — 当 `withReadSkill === true`

**MCP 工具**：

```ts
for (const handle of mcpManager.getTools()) {
  if (mcpToolNames.includes(handle.fullName)) {
    registry.register(wrapMcpTool(handle.server, handle.def, handle.client, handle.timeout))
    activeMcpNames.push(handle.fullName)
  }
}
```

仅注册 `mcpToolNames` 允许列表命中的已连接 MCP 工具。

#### 激活阶段

```ts
registry.setActive([
  ...activeTools.filter((name) => ALL_TOOL_NAMES.has(name)),
  ...activeMcpNames,
  ...(withReadSkill ? ["read_skill"] : []),
])
```

关键设计点：

- 激活集与注册集**分离**，允许注册所有工具但仅激活部分。
- `activeTools` 参数会经过 `ALL_TOOL_NAMES` 白名单过滤，防止越权激活未注册工具。
- `read_skill` 不在 `ALL_TOOL_NAMES` 中，通过单独追加激活。

### 4. 子代理工具 (`task`) 的特殊处理

`task` 工具在注册时接收一个 `getTools` 回调：

```ts
createTaskTool({
  ...taskDeps,
  getSessionId: taskDeps.getSessionId ?? effectiveSessionDeps?.getSessionId,
  getTools: () => registry.getActive().filter((tool) => tool.name !== "task"),
})
```

该回调在每次 `task` 工具执行时被调用，从**当前激活集**中派生子代理工具集，并显式排除自身（`tool.name !== "task"`），防止无限递归。

### 5. 依赖注入模式

工具工厂函数（如 `createReadTool`、`createBashTool`）接受 `cwd` 和可选的 `*Deps` 对象，而非直接依赖全局状态。`createRegistry` 负责组装这些依赖，实现工具层与业务逻辑的解耦。

## 类型检查

`pnpm exec tsc --noEmit` — 无错误输出。
