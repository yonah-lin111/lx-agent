# 7. Resources、Project Trust 与 Extensions

## 7.1 目标

复刻 pi 的资源发现和扩展模型，同时把扩展能力限制在版本化公开接口。扩展运行在 main，拥有 pi 同等本机权限；renderer 只能消费序列化贡献和受控 UI 服务。

## 7.2 ResourceLoader

目标文件：

```text
src/main/agent/resources/resourceLoader.ts
src/main/agent/resources/projectTrust.ts
src/main/agent/resources/skills.ts
src/main/agent/resources/promptTemplates.ts
src/main/agent/resources/systemPrompt.ts
src/main/agent/extensions/extensionManager.ts
```

资源来源按优先级合并：

1. 全局用户目录（LX 自己的 config/data root）；
2. 当前项目 `.pi/` 资源；
3. 当前项目或祖先目录的 `.agents/skills`；
4. `AGENTS.md`、`CLAUDE.md` 上下文文件；
5. 设置中显式注册的资源路径。

资源 loader 返回带 source、path、version、trusted 的结构，不把文件系统路径直接交给 renderer。system prompt、skills、templates 每次 turn snapshot 解析一次。

## 7.3 Project Trust

对齐 pi 的边界：

- `.pi/settings.json`、`.pi/extensions`、`.pi/skills`、`.pi/prompts`、`.pi/SYSTEM.md` 等触发 trust 检查；
- `AGENTS.md`/`CLAUDE.md` 是否加载按 pi 的 context 规则处理；
- trust decision 按 canonical cwd 存储，父目录决策可继承；
- 默认 `ask`，Electron 有 UI 时由 modal 询问；无 UI 的内部命令按显式配置处理；
- decline 只跳过受保护资源，不限制 shell、文件写入或用户权限。

trust manager 运行在 main；renderer 只调用 `agent.trust.getStatus/resolve`，不能自行决定加载路径。

## 7.4 Skills 与 Prompt Templates

- 解析 frontmatter、name、description、正文和 argument hints；
- 过滤非法 name、缺失 description、超长内容和重复名称；
- skill invocation 形成 user message 或 system context 的明确 entry；
- template 参数替换必须在 snapshot 内完成，缺参数给出 validation error；
- resource reload 只影响下一个 turn，并发运行不改写当前 snapshot。

## 7.5 AgentExtensionApi

目标文件：

```text
src/main/agent/extensions/extensionApi.ts
src/main/agent/extensions/extensionTypes.ts
src/main/agent/extensions/extensionLoader.ts
src/main/agent/extensions/extensionEvents.ts
src/shared/agentExtension.ts
```

公开能力：

- `on(event, handler)`：startup、resource、session、agent、turn、model、tool、input、shutdown；
- `registerTool`：schema、execute、optional renderer metadata；
- `registerCommand`：slash/command palette handler；
- `registerProvider`：实现 LX `ModelProvider` 契约；
- `registerResourcePath`：skill/template/system prompt 路径；
- `appendEntry`：写入 custom entry，必须经过 SessionRepository；
- `ui.notify/confirm/select/input/status/widget`：转为事件或受控 IPC UI request；
- `onShutdown`：释放 watcher、socket、child process、timer。

扩展 factory 可 async，但 startup 不得启动无法由 session shutdown 回收的后台资源。每个扩展有 id、version、source、scope、loadedAt、diagnostics。

## 7.6 加载与错误策略

首期允许全局目录、项目 `.pi/extensions` 和显式路径的 JS/TS 模块；TS loader 可选 `jiti` 或构建期 bundling，但不能让扩展直接 import `src/main/agent` 私有路径。

- 扩展加载错误记录并继续启动其他扩展；
- hook 错误按事件类型决定：观察型错误隔离，控制型 hook 可拒绝当前操作；
- tool name、command name、provider id 冲突必须拒绝或由明确优先级处理；
- `/reload` 先 shutdown 旧扩展，再加载新实例，不允许旧 listener 残留。

## 7.7 Renderer 扩展 UI

不加载 pi TUI。main 扩展只能发出 serializable view descriptor：`status`、`widget`、`modal request`、`message renderer key`、`tool details schema`。renderer 通过 registry 映射到受控 React 组件。

任意 React 模块热加载、直接操作 DOM、读取 Node 权限列为后续插件系统，不属于首期 ExtensionApi。

## 7.8 验收

- global/project/explicit extension 的 discovery、trust、reload、shutdown 有测试。
- extension tool、hook、command、provider、resource contribution 都能在同一 Runtime 中注销。
- 扩展不能通过公开类型取得 SQLite connection、BrowserWindow、ipcMain、child_process 或 provider raw request。
- 项目拒绝 trust 时，受保护扩展未加载；已确认运行的工具权限语义仍与 pi 一致。

## 7.9 当前不实施

- 不实现 npm/git 包管理器、自动安装依赖、远程扩展市场。
- 不实现 pi TUI custom component、raw terminal input 和主题对象。
- 不实现 durable harness 草案中的 extension effect replay。
