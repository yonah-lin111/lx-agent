# 3. 工具注册与执行环境

## 3.1 目标

复刻 pi 的 `read`、`write`、`edit`、`bash` 工具，同时把 Node 权限隔离在 main。工具必须是可注册、可替换、可测试的 capability，而不是 Agent Loop 中的 `switch` 分支。

## 3.2 ExecutionEnvironment

目标文件：

```text
src/main/agent/execution/environment.ts
src/main/agent/execution/nodeEnvironment.ts
src/main/agent/execution/pathPolicy.ts
src/main/agent/execution/shell.ts
```

接口覆盖：

```ts
interface ExecutionEnvironment {
  readFile(path: string): Promise<FileReadResult>
  writeFile(path: string, content: string): Promise<void>
  applyEdit(path: string, edits: TextEdit[]): Promise<EditResult>
  exec(command: string, options: ExecOptions, signal: AbortSignal): Promise<ExecResult>
  stat(path: string): Promise<FileStat>
  list(path: string): Promise<FileEntry[]>
  image(path: string, options?: ImageOptions): Promise<ImageResult>
}
```

首期 `NodeExecutionEnvironment` 直接使用当前用户权限，对齐 pi 的无内置沙箱模型。接口不能泄漏 `fs.Dirent`、`ChildProcess`、`Buffer` 或 Electron 类型，方便后续替换容器/远程实现。

## 3.3 内置工具

每个工具都是 `AgentTool<TInput, TContext>`：

- `name`、`description`、参数 schema、`execute`、可选 `render` metadata；
- `execute` 接收 `toolCallId`、validated input、`ExecutionToolContext`、signal、增量回调；
- 返回 content、details、isError 和可选结构化结果；
- schema 在 main 边界运行时校验，模型传入非法参数不能进入文件系统或 shell。

### read

- 支持文件、目录、行范围和可选图片；
- 输出按字节/行数截断，响应包含截断原因和可继续读取的范围；
- 二进制文件不能当作 UTF-8 静默替换；
- 路径解析与 pi 行为一致：相对 cwd 解析，解析失败返回结构化 `file` error。

### write

- 创建父目录、写临时文件、rename；
- 写入期间同一路径由 `FileMutationQueue` 串行化；
- signal 取消不留下半写文件；
- 结果包括字节数和路径，不包括默认文件全文。

### edit

- 支持精确 old/new、行范围或 unified diff；
- old 文本不唯一时拒绝写入，不猜测；
- 保存前校验目标内容版本，避免并发覆盖；
- 返回 diff 摘要和变更行，不把完整内容塞入事件。

### bash

- 使用 `spawn`，不通过 shell 拼接不可信参数；
- cwd、env、timeout、max output、signal 全部显式传入；
- stdout/stderr 增量发出 `tool_execution_update`，最终结果截断并注明原因；
- 退出码、signal、timeout、aborted 分开表示；
- 默认不把 API key、环境变量全文或命令输出写入 telemetry。

## 3.4 工具注册表

`ToolRegistry` 负责内置工具、扩展工具和 MCP 工具的合并：

1. 注册名必须唯一；重复注册由扩展错误策略处理，不能静默覆盖。
2. `getTools()` 返回完整注册表，`setActiveTools()` 只改变当前 turn 可见集合。
3. 工具上下文由 Runtime 每 turn 解析一次；静态 context 与 provider callback 不能混用为两个快照。
4. 工具 hook 可在执行前阻止、改写 input，在执行后改写 result；hook 错误按扩展策略处理。

## 3.5 权限与信任说明

- 不提供内置沙箱、命令审批或宿主权限降级；工具与扩展拥有启动 LX 的用户权限。
- project trust 只决定是否加载项目 `.pi` 资源/扩展/skills；一旦用户开始在项目中运行 Agent，工具仍是全权限。
- 这不是安全边界。文档和 UI 必须提示用户不要在不可信仓库中无人监控运行。
- 后续容器实现只能通过 `ExecutionEnvironment` 插件接入，不能在 read/write/bash 中增加第二套判断。

## 3.6 验收

- fake environment 覆盖所有工具成功、参数错误、路径错误、超时、abort、输出截断和并发写入场景。
- Node 环境测试确认文件操作和 shell 只发生在 main；renderer bundle 不包含 `node:fs`、`child_process`、AI SDK。
- 工具结果能 JSON round-trip，并可由 renderer 以通用 tool card 渲染，不依赖具体工具类。
- 扩展工具与内置工具共享同一 schema、生命周期和错误语义。

## 3.7 当前不实施

- 不实现 pi 的 Gondolin、Docker、OpenShell 或远程沙箱；只保留环境接口。
- 不复制 pi TUI 的工具组件渲染器；只返回 renderer 可解释的结构化 details。
