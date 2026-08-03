# LX Agent 复刻方案总览

## 1. 文档目的

本文档把 `pi-main` 的 Agent Loop、AgentHarness 和 coding-agent session 能力，重写为 LX Agent 的 Electron 原生实现方案。当前只产出设计和实施阶段，不修改运行时代码。

目标不是复制 pi 的 TUI 或包结构，而是在 LX 的三进程边界内复刻可观察行为，并保留可替换的模型、工具、会话存储、资源和扩展接口。

## 2. 已确认决策

| 决策 | 结论 |
| --- | --- |
| 复刻基线 | 以 pi 当前源码和行为测试为已实现基线 |
| 未实现设计 | pi 文档中未落地的 durable harness 设计必须登记，但标为未实现且本轮不做 |
| 实现方式 | LX 内部独立重写，不依赖 pi 包，不复制 TUI |
| 权限模型 | 对齐 pi：Agent 进程继承当前用户权限；项目 trust 只控制资源加载，不是沙箱 |
| Provider | 复用当前 Vercel AI SDK 适配供应商；Harness 只依赖 LX 自有模型契约 |
| 存储 | SQLite 是唯一运行时真源；JSONL 只做兼容导入导出 |
| Runtime | main 进程按 `sessionId` 管理 Runtime；单会话串行，跨会话可并行 |
| 扩展 | 主进程加载 TS/JS 扩展，提供版本化公开 API，不允许导入内部实现 |
| UI | `AgentPage.tsx` 只负责页面组合；TUI 能力映射为 React 命令、状态、对话框和扩展槽位 |
| 宿主范围 | 不实现 pi 的 CLI、print/json mode、RPC server、独立 client/server 包 |

## 3. 当前 LX 事实

- `src/renderer/src/features/agent/AgentPage.tsx` 只有 66 行，组合 `AgentMessageList` 和 `AgentInput`。
- `useAgentChat` 使用 Mock 回复和 `setInterval` 打字机效果；没有真实 Provider、Agent Loop、工具调用或 IPC。
- `chatHistoryStore` 是模块级内存数组，最多 50 条会话，重启即丢失。
- 当前消息只有 `user | assistant | system` 和字符串 `content`，无法表示 thinking、tool call、tool result、usage、error 或分支。
- main 已有 `better-sqlite3`、项目表、设置 IPC；尚无 Agent 表、Runtime、工具执行器或事件推送通道。
- `RightSideBar` 通过 `key` 强制重挂载 `AgentPage`，后续应改为 sessionId 驱动，不再依赖组件卸载保存会话。
- 项目规范要求 shared 只放无副作用 DTO/常量/纯函数，renderer 不得直接接触 Electron、Node、数据库或 main 模块。

## 4. pi 能力盘点

### 4.1 当前源码和测试纳入复刻

| 能力 | pi 参考位置 | LX 目标 |
| --- | --- | --- |
| Agent Loop | `packages/agent/src/agent-loop.ts` | 流式请求、tool call 循环、继续执行、事件归并 |
| Agent 状态 | `packages/agent/src/agent.ts` | streaming、pending tools、error、abort、idle settlement |
| Harness | `packages/agent/src/harness/agent-harness.ts` | prompt、skill、template、steer、follow-up、next turn、phase 锁 |
| 内置工具 | `packages/agent/src/harness/tools/` | read、write、edit、bash、图片读取、截断、超时、取消 |
| Session | `packages/agent/src/harness/session/` | append-only entry、树、leaf、branch、fork、恢复 |
| coding-agent facade | `packages/coding-agent/src/core/agent-session*.ts` | new/resume/fork/import、模型/思考级别、上下文构建 |
| Compaction | `packages/agent/src/harness/compaction/` 与 coding-agent compaction | context threshold、overflow retry、branch summary |
| Resources | coding-agent resource loader、skills、prompt templates | `AGENTS.md`/`CLAUDE.md`、skills、templates、system prompt |
| Extensions | `packages/coding-agent/docs/extensions.md` | tools、commands、hooks、provider、UI service、持久化 entry |
| Provider runtime | 当前 LX settings + AI SDK | 模型注册、thinking map、headers、usage、retry、错误分类 |
| 可观测性 | pi `observability.md` | run/step/generation/tool span，默认脱敏 |

### 4.2 登记但当前不实施

以下内容来自 pi 的 durable harness 草案，不是参考仓库当前已验证实现：

- durable harness v2 的 effects/generator 两种执行模型及可恢复 effect journal；
- 多 ref/lane 并行会话、跨 ref 复制、分布式复制和 split-brain 合并；
- crash recovery 对每个 run、step、tool task 的完整恢复状态机；
- harness log 与 session tree 的双视图、写入租约和跨表共享 sequence 的最终方案；
- `runWhenIdle` facade、faulted harness、挂起任务自动恢复等未完成生命周期收口；
- pi 文档中标记 TODO、open question 或尚无测试的 API。

本轮仅为这些能力预留 `SessionRepository`、`AgentRuntimeRegistry`、事件序号和扩展 API 的接口，不实现上述 durable 语义。任何阶段完成时都不得把预留接口描述成已支持恢复。

## 5. 目标架构

```text
renderer/features/agent
  AgentPage -> useAgentSession -> agentApi -> window.api.agent
                                      ▲             │
                                      │             │ IPC invoke + push events
shared/contracts + shared/ipc         │             ▼
  AgentCommand / AgentEvent / DTOs ───┴──── preload agentApi
                                                    │
main/agent
  AgentRuntimeRegistry(sessionId)
    └─ AgentHarness
       ├─ AgentLoop
       ├─ ModelRuntime (AI SDK adapters)
       ├─ ToolRegistry -> ExecutionEnvironment
       ├─ ResourceLoader / ExtensionManager
       ├─ Compaction / BranchSummary
       └─ SessionRepository -> SQLite
```

### 5.1 进程边界

- `main/agent`：所有模型请求、Node 文件系统、shell、扩展加载、SQLite、AbortController 和生命周期控制。
- `preload/api/agentApi.ts`：最小白名单 API；invoke 方法只传可结构化克隆的 DTO；事件订阅返回取消函数。
- `shared/agent.ts` 和 `shared/ipc/agentChannels.ts`：跨进程 DTO、联合类型、channel 常量、版本号和错误码。
- `renderer/features/agent`：把 snapshot 与有序事件折叠成视图状态；只渲染，不运行工具和 Provider。

### 5.2 一次 prompt 数据流

1. `AgentPage` 调用 `useAgentSession().prompt(text)`。
2. feature API 调用 preload `agent.prompt`，携带 `sessionId` 和 `clientRequestId`。
3. main handler 校验 DTO，向 `AgentRuntimeRegistry` 获取对应 Runtime。
4. Harness 锁定 phase，创建 turn snapshot，追加 user entry，然后进入 Agent Loop。
5. ModelRuntime 将 AI SDK stream 转换成统一 `AgentEvent`；工具事件在 main 执行并继续循环。
6. Harness 在 save point 追加 assistant/tool/compaction entry，更新 snapshot 与 sequence。
7. main 通过 `webContents.send` 推送有序事件；renderer 合并事件，断线后用 snapshot + `afterSequence` 补齐。
8. prompt Promise 只表示操作 settlement，不代替事件流；错误同时进入错误 DTO 和持久化日志。

## 6. 阶段目录

| 文件 | 结果 |
| --- | --- |
| `1-contracts-and-boundaries.md` | 跨进程契约、领域模型、错误和不变量 |
| `2-model-runtime-and-loop.md` | Provider 适配、流事件、Agent Loop、队列和 abort |
| `3-tools-and-execution.md` | ExecutionEnvironment 与 read/write/edit/bash |
| `4-session-sqlite.md` | SQLite 会话树、entry、fork、导入导出 |
| `5-harness-and-runtime-registry.md` | Harness 生命周期、Runtime Registry、恢复快照 |
| `6-electron-ipc-and-renderer.md` | IPC、preload、AgentPage、状态投影和 UI 映射 |
| `7-resources-and-extensions.md` | trust、resources、skills、templates、扩展 API |
| `8-compaction-retry-and-observability.md` | 压缩、分支摘要、重试、事件日志和脱敏遥测 |
| `9-parity-tests-and-rollout.md` | 兼容测试、迁移、灰度启用和完成判定 |

阶段必须按编号顺序推进；后阶段不得通过 renderer 临时逻辑绕过前阶段契约。

## 7. 完成定义

“Agent 复刻完成”必须同时满足：

1. 同一模型和输入下，prompt、tool call、abort、retry、compaction、fork、resume 的事件顺序与 pi 行为测试的语义一致。
2. SQLite 重启后能恢复 session tree、active leaf、model/thinking/tools 配置和已提交消息；未实现 durable run recovery 必须显式报为不可恢复。
3. Renderer 不含 Node/Electron/Provider/tool 执行代码，所有 Agent IPC 都有 shared channel、preload 转发、main handler 和契约测试。
4. 扩展只使用公开 `AgentExtensionApi`，可注册 tool/command/hook/provider/resource，并能在 session shutdown 清理资源。
5. 旧 Mock 对话被删除或明确隔离，不得与真实 Runtime 同时作为隐式 fallback。
6. 每个能力矩阵条目都有对应测试或明确的“当前不实施”标记。

## 8. 主要风险

- pi 的 durable harness 文档仍在演进；不得把草案字段直接写成稳定数据库协议。
- SQLite 迁移和现有项目表共用连接，必须使用独立 Agent migration，不能修改既有建表 SQL 伪造历史。
- main 进程的全权限工具与任意扩展是本地信任边界，不是安全沙箱；UI 必须明确显示当前 cwd 和运行状态。
- AI SDK 的 stream 事件和 pi 的 provider 事件不是同一类型，必须通过适配器归一，不能把第三方对象穿过 IPC。
- 事件推送可能晚于 renderer 重连；sequence、snapshot 和幂等 event reducer 是必需品，不是优化项。
