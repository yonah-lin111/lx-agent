# RepoMap 仓库结构地图（架构分析） 设计

> 需求来源：参考 `openclaude-main` 分析可移植功能，用户选定 RepoMap（架构分析）为本次实现项。
> 工作区：`.worktrees/feat-repo-map`（分支 `feat/repo-map`，从 `dev` 切出）
> 本文件记录 grill 1-7 的全部决策，作为实现与验收的唯一依据。

## 1. 目标

1. 新增内置只读工具 `repo_map`：用 tree-sitter 解析仓库源码，提取符号定义/引用，构建 IDF 引用图并用 PageRank 排序，输出 token 预算内的文件+符号签名结构地图；带磁盘哈希缓存，模型可在会话中按需调用（支持 `focus_files` / `focus_symbols` 聚焦）。
2. 会话启动时自动把结构地图快照注入系统提示词（1024 token 预算、5s 超时、失败 fail-open），模型无需先探索即可回答“项目怎么组织”。
3. 全链路可测试：管线纯函数化，工具与注入注入依赖，vitest 覆盖。

## 2. 非目标

- 不实现 `/repomap` 斜杠命令与任何独立 UI 查看器（`AgentPage.tsx` 零改动）。
- 不实现 LSP 兜底、增量重解析、更多语言（仅 TS/TSX/JS/Python）。
- 不改动 subagent 派发、协作模式语义、compaction/tokenSaver 逻辑。

## 3. 候选功能分析（openclaude-main 对比结论）

| # | 候选功能 | openclaude 形态 | lx-agent 现状（已核查） | 结论 |
|---|---|---|---|---|
| 1 | **RepoMap 架构地图** | tree-sitter 符号提取 + IDF 图 + PageRank + token 预算渲染；工具/`/repomap` 命令/会话自动注入（`src/context/repoMap/*`、`src/tools/RepoMapTool/*`、`src/context.ts:171-213`） | 无任何仓库结构分析能力 | **本期实现**（工具 + 自动注入） |
| 2 | 记忆自动提取（memdir） | `autoExtractFacts` 自动沉淀事实 + `vectorIndex` 语义检索 + `memoryAge`/`memorySecurity` 注入防护 | `memories/memoryManager.ts` 仅手动 `memory` 工具（user/workflow XML，200 行/25KB 截断） | 后续演进（自动提取+防护价值高，本期不做） |
| 3 | MonitorTool 后台命令监控 | 后台命令输出流式通知（30min） | `jobs/jobRegistry.ts` + `job_output/job_list/job_kill` + bash `background: true` 已覆盖 | 不移植（能力重叠） |
| 4 | CtxInspectTool 上下文折叠检查 | 依赖 `contextCollapse` 服务（多 agent span 折叠） | 已有 compaction/`contextBudget.ts`/上下文容量告警段（`systemPromptManager.ts:711-748`） | 不移植（架构不同，无等价服务） |
| 5 | 成本追踪 cost-tracker | token 计价与预算告警 | 已有 `usageRecorder.ts`（定价解析+落库+广播）与 usage 契约 | 已具备 |
| 6 | Team/Task 看板与消息总线 | `TeamCreateTool`/`SendMessageTool`/`TaskCreateTool` 跨会话消息 | 子代理角色/并发槽位/嵌套已具备（`subagent/*`），无跨代理消息总线与共享任务板 | 后续演进 |
| 7 | Worktree 工具 | `EnterWorktreeTool`/`ExitWorktreeTool`（会话内切换 cwd） | UI 已支持会话绑定工作区（`AgentPage.tsx` `buildGitWorktreeOptions`），无模型可调用工具 | 后续演进 |
| 8 | Proactive + Brief 主动汇报 | 状态机（`proactive/index.ts`）+ `SendUserMessage` 主动消息通道 | 无 | 不移植（与本地交互式产品定位冲突） |
| 9 | ScheduleCron/Sleep | cron 调度工具 | 已有调度契约（`src/shared/contracts/schedule.ts`）与 jobs | 不移植 |
| 10 | DiscoverSkills | 源码快照为 stub（未包含实现） | 技能已自动扫描注入（`skills/skillLoader.ts`） | 不适用 |

## 4. 决策记录（grill 结论）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 交付范围 | 分析文档 + 实现 1 个最高价值功能（RepoMap）；其余候选只写入本文档 |
| 2 | 交付形态 | 工具 + 会话启动自动注入（对齐 instructions/memory 的无条件注入哲学；不设设置开关） |
| 3 | 提取技术 | web-tree-sitter (WASM)，仅 TS/TSX/JS/Python；不用 LSP（5s 预算不可行）、不用正则 |
| 4 | 渲染层 | 仅 `BUILTIN_UNDERSCORE_TOOLS` 加一行；`AgentPage.tsx` 零改动（列为任务 Location 仅为模板占位，经核实无需改动） |
| 5 | wasm 资产 | vendor 5 个 wasm 到 `resources/repomap/`（约 8MB）；运行时依赖只加 `web-tree-sitter` |
| 6 | 注入刷新 | 会话启动快照（cwd 键控 + TTL），会话内稳定；要最新结构由模型调用工具（哈希缓存） |
| 7 | 工作区流程 | docs 先提交 `dev`；代码+测试在 `feat/repo-map` 提交；完成后询问合并 |

## 5. 现状约束（已核查）

- `assembly.ts:210-233`：`ALL_TOOL_NAMES` 是激活链第一道闸；`assembly.ts:280-347` 注册全集后 `setActive` 按能力快照过滤，未登记的 `repo_map` 不会激活。
- `systemPromptManager.ts:47-64` 分段名、`:28-44` 顺序（INSTRUCTIONS=200、WORKSPACE_MEMORY=250、RUNTIME_CONTEXT=300）；分段渲染函数为**同步**签名，异步构建必须在装配前完成。
- `buildSystemPromptSync` 被 4 处调用：`sessionRunner.ts:315`（rebuild）、`sessionRunnerTurns.ts:97`（每轮）、`sessionRunnerAgentFactory.ts:90/106/125`（会话/子代理）。全部同步，无法在其中 await tree-sitter。
- `sessionRunner.ts:338-413` `send()` 为异步入口，`ensureReady()` 同步装配；`getEffectiveCwd()` 可取得有效 cwd。
- `sessionRunnerLifecycle.ts:36-49` `cleanUp` 是会话资源清理挂点（本设计快照按 cwd 键控、带 TTL，无需会话级清理）。
- `src/shared/settings.ts:408-428` `SUBAGENT_PERMISSION_TOOL_NAMES` 是权限目录/角色白名单/默认子代理工具集的唯一来源；`permissions.ts:119-160` 模式门控黑名单只拦 `write/edit/apply_patch/todowrite/memory`，只读工具在 plan/review 自动放行；minimal 白名单 `["bash","read","write","edit"]` fail-closed，`repo_map` 不进入。
- `renderer .../AgentMessageItem/constants.ts:14-23` `BUILTIN_UNDERSCORE_TOOLS`：含下划线且不在集合内的工具会被 Active Tools 面板误分类为 MCP（`FlowItemSystemContent.tsx:62-72`）。
- 注入面板对 section 无硬编码白名单：新 section 自动进入系统提示词折叠列表（`FlowItemSystemContent.tsx:107-134`）。
- 资产路径先例：`src/main/lib/emulatorAssets.ts:8-11`（`app.isPackaged` → `process.resourcesPath/resources/...`）；`package.json build.extraResources=["resources/**"]` 已覆盖 `resources/repomap`。
- 数据根：`src/main/paths.ts:16-17` `getAppDataRoot()`，测试经 `LX_AGENT_DATA_ROOT` 隔离（`test/setup.ts`）。
- 依赖现状：无 tree-sitter；已有 Electron 原生模块（better-sqlite3/node-pty）重建流程，WASM 方案不引入新原生编译负担。

## 6. 详细设计

### 6.1 模块结构（`src/main/agent/repoMap/`）

| 文件 | 职责 | 移植来源（openclaude-main，MIT） |
|---|---|---|
| `types.ts` | Tag/FileTags/RepoMapOptions/RepoMapResult/CacheData 等契约 | `src/context/repoMap/types.ts` |
| `paths.ts` | wasm 资产目录解析（打包态 `process.resourcesPath`；开发/测试态 `process.cwd()/resources/repomap`），Electron-free | `emulatorAssets.ts` 同构简化 |
| `queries.ts` | 4 语言 tree-sitter 查询源码（def/ref capture） | `src/context/repoMap/queries.ts` |
| `parser.ts` | web-tree-sitter 初始化、语言/查询加载与缓存；`initParser({ wasmDir? })` 可注入 | `src/context/repoMap/parser.ts` |
| `symbolExtractor.ts` | 逐文件提取 def/ref 标签（批处理 + 缓存） | `src/context/repoMap/symbolExtractor.ts` |
| `gitFiles.ts` | 文件枚举：`git ls-files` 优先，非 git 仓库回退目录遍历（ignore 规则） | `src/context/repoMap/gitFiles.ts` |
| `graph.ts` | IDF 加权文件引用图 | `src/context/repoMap/graph.ts` |
| `pagerank.ts` | 图上的 PageRank 排序（支持 focus 提升） | `src/context/repoMap/pagerank.ts` |
| `tokenize.ts` | 轻量 token 估算 | `src/context/repoMap/tokenize.ts` |
| `renderer.ts` | token 预算内渲染“文件 + 签名”地图 | `src/context/repoMap/renderer.ts` |
| `cache.ts` | 磁盘缓存：`getAppDataRoot()/cache/repomap/<sha256(root)>.json`；按 mtime+size 失效；渲染结果按 mapHash 缓存 | `src/context/repoMap/cache.ts`（存储位置改造） |
| `index.ts` | `buildRepoMap()` 主编排 + `invalidateCache/getCacheStats` | `src/context/repoMap/index.ts` |
| `snapshot.ts` | cwd 键控的会话快照注册：`primeRepoMapSnapshot(cwd)` / `getRepoMapSnapshot(cwd)` / TTL | 新增（openclaude 在 `context.ts` memoize） |

单一文件 ≤500 行；所有文件只依赖 node 内置 + `web-tree-sitter` + `@/paths`，保持 Electron-free（可在 vitest 直接跑）。

### 6.2 数据契约（`types.ts`）

```ts
export interface Tag { kind: "def" | "ref"; name: string; line: number; signature: string; subKind?: string }
export interface FileTags { path: string; tags: Tag[] }
export interface RepoMapOptions { root?: string; maxTokens?: number; focusFiles?: string[]; focusSymbols?: string[]; files?: string[]; wasmDir?: string; shouldContinue?: () => void }
export interface RepoMapResult { map: string; cacheHit: boolean; buildTimeMs: number; fileCount: number; totalFileCount: number; tokenCount: number }
```

### 6.3 工具契约（`src/main/agent/tools/repoMap.ts`）

- `name: "repo_map"`，`label: "Repository Map"`，只读、可并发（`executionMode: "parallel"`）。
- 输入 zod：`max_tokens`（默认 1024，clamp 256-8192）、`focus_files`（相对路径数组，可选）、`focus_symbols`（符号名数组，可选）。
- 输出文本：摘要行 + 地图原文，附 `cache_hit/build_time_ms` 信息。
- 失败语义：非 git 且无源码文件 → 返回空地图提示；解析失败逐文件跳过；不抛异常到 turn。
- 描述文案对齐 openclaude：明确“用它了解仓库结构/跨文件重构前定位，而不是替代 read/grep”。

### 6.4 提示词注入契约

- `PROMPT_SECTION_NAMES.REPO_MAP = "agent:repo-map"`，`PROMPT_ORDERS.REPO_MAP = 260`（WORKSPACE_MEMORY 之后、RUNTIME_CONTEXT 之前）。
- section 文本（`literal: true`）：
  - `getRepoMapSnapshot(ctx.cwd)` 命中 → `<repo_map>\n(结构地图说明行)\n\n{map}\n</repo_map>`；
  - 未命中/超过 TTL → 返回空串并 fire-and-forget `primeRepoMapSnapshot(ctx.cwd)`（TTL 内部重建，stale-while-revalidate），不阻塞装配。
- `snapshot.ts` 快照语义：cwd 键控；首次构建 1024 token、5s 超时、失败存 null 并 60s 内不重试；TTL 5 分钟——过期后保留旧文本并后台重建，下次装配自动换新。会话内通常稳定（对齐 grill #6）。

### 6.5 激活与权限

1. `ALL_TOOL_NAMES`（`assembly.ts:210`）加 `"repo_map"`，并在 `assembly.ts` 注册 `createRepoMapTool(cwd)`。
2. `SUBAGENT_PERMISSION_TOOL_NAMES`（`src/shared/settings.ts:408`）加 `"repo_map"`：权限目录、角色白名单校验、默认子代理工具集同步生效（子代理可用；符合只读组语义）。
3. 模式门控：plan/review 黑名单不含只读工具 → 自动放行；minimal 白名单不含 → 自动禁用（fail-closed，符合预期）。

### 6.6 资源与打包

- `resources/repomap/` 入库 5 个文件：`tree-sitter.wasm`（`web-tree-sitter@0.25.10`）、`tree-sitter-typescript|tsx|javascript|python.wasm`（`tree-sitter-wasms@0.1.13`）；来源与版本记录于本文件。
- `package.json` dependencies 增加 `web-tree-sitter: 0.25.10`（externalizeDepsPlugin 自动 external，主进程运行时从 node_modules 加载 JS）。
- 打包态 wasm 经 `extraResources` 到 `process.resourcesPath/resources/repomap`；开发/测试态从 `process.cwd()/resources/repomap`；`parser.ts` 支持 `wasmDir` 注入覆盖。

### 6.7 渲染层改动

- `BUILTIN_UNDERSCORE_TOOLS`（`AgentMessageItem/constants.ts:14`）加 `"repo_map"`（一行）。
- `ToolCallTitle.tsx` 走通用 fallback（实现时若 fallback 不可读才补最小分支，避免无谓改动）。
- `AgentPage.tsx` 零改动。

## 7. 风险与回滚

- **首启性能**：冷缓存首次构建受 5s 超时约束，超时即不注入；磁盘缓存让后续会话毫秒级。回滚：删 `cache/repomap` 目录即可。
- **wasm 体积**：约 8MB 入库；不影响安装包其他部分。
- **提示词膨胀**：固定 ≤1024 token；TTL 内文本稳定，不随编辑抖动（grill #6）。
- **工具误用**：描述中限定使用场景；只读无副作用，最坏情况是浪费一次调用。
- **回滚路径**：整体 revert `feat/repo-map`；运行期可通过模式（minimal）或删除工具名自动降级，无数据迁移。

## 8. 后续演进（未入选）

1. memdir 式记忆自动提取 + 向量检索 + 注入防护（候选 #2）。
2. 跨代理消息总线与共享任务板（候选 #6）。
3. 模型可调用的 worktree 工具（候选 #7）。
4. `/repomap` 用户命令与独立查看器 UI。
5. 更多语言语法与 LSP 增强（如 workspaceSymbol 聚焦）。
