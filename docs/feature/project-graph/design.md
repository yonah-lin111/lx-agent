# 项目地图（project-graph）设计

> 需求来源：用户原始需求（/initGraph 命令、状态栏地图按钮、System Prompt 注入与更新机制、对标 Claude Code / Codex / Aider 调研）
> 工作区：`.worktrees/feat-project-graph`（分支 `feat/project-graph`，从 `dev` 切出）
> 本文件记录 grill 1-14 的全部决策，作为实现与验收的唯一依据。

## 1. 目标

1. 为项目生成一张**静态粗粒度地图**：目录结构、入口点、技术栈、关键文件 + 每个模块一句英文职责描述，写入 `<仓库根>/.lx/graph/graph.xml`。
2. `AgentInput` 新增 `/initGraph` 命令，手动初始化/重建地图（默认不自动触发）。
3. `AgentStatusBar` 权限按钮右侧新增地图按钮：无地图 / 有地图新鲜 / 有地图陈旧三态 + 生成中态，tooltip（`trigger="both"`）内提供初始化/重新初始化动作。
4. 项目存在地图时，新建会话装配 System Prompt 注入地图段落；通过指纹复扫实现陈旧警告（注入 `stale` 属性 + `<notice>`）。
5. 地图模型可在设置中配置（`graphModel`），用量计入 usage 日志（purpose `graph`）。

## 2. 非目标

- 不做 Aider 式符号级地图（tree-sitter / PageRank / token 预算渲染）——符号级能力由 codegraph / Codebase Memory MCP 承担，重复实现即冲突。
- 不做 LLM 直接生成 XML：LLM 只输出"模块路径 → 描述"JSON 映射，XML 由主进程确定性组装（候选 A）。
- 不做自动重建、不做文件 watcher、不做增量更新；重建永远是显式动作（`/initGraph` 或按钮）。
- 不修改目标项目 `.gitignore`；地图私有不入库。
- 不进入 Agent 对话流（headless 单次调用），不占用会话上下文。
- 不改动 `mcpGuidance.ts` 的 server 指引结构与 `codegraph`/`codebase-memory` 行为。

## 3. 决策记录（grill 结论）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 地图定位 | A+C：确定性粗粒度骨架 + LLM 补模块描述；骨架可自动校验、描述可降级 |
| 2 | C 部分生成方式 | 主进程无工具单次调用（btwAskGenerator 模式），失败降级为纯骨架 |
| 3 | XML 组装权 | LLM 只输出描述 JSON；主进程确定性序列化 + 转义，XML 100% well-formed |
| 4 | 存储 | `<仓库根>/.lx/graph/graph.xml`，私有不入库；不自动改目标项目 `.gitignore` |
| 5 | 注入位置 | `systemPromptManager` 独立 section `agent:project-graph`，order 120（MCP 指引后），`literal: true` |
| 6 | 更新机制 | 手动刷新 + 陈旧警告；指纹复扫比对；无 watcher、无自动重建 |
| 7 | 按钮状态机 | 三态视觉（无/新鲜/陈旧）+ 生成中；tooltip `trigger="both"` 内动作；readOnly 与无项目隐藏 |
| 8 | 预算 | 扫描 ≤10k 文件、模块深度 ≤3、生成 ≤16KB、注入硬顶 24KB（丢尾部 `<module>`）；超限 `truncated`/`stale="unknown"` |
| 9 | 执行架构 | main `src/main/agent/graph/` + `graph:status`/`graph:init` channel + `graphHandlers`；renderer `graphStore` 被按钮与命令共用；同项目并发去重 |
| 10 | XML Schema | 见第 5 节（已冻结）；描述统一英文 |
| 11 | 地图模型配置 | `graphModel` 镜像 `titleSummary`（缺省回退 `defaultModel`）；`UsagePurpose` 增 `"graph"` |
| 12 | 命令运行时行为 | 流式期间允许执行；toast 反馈 full/skeleton/失败；状态无轮询；btw 与无项目拒绝 |
| 13 | 交付流程 | dev 先提交本目录文档；worktree 实现与测试；完成后询问合并 |
| 14 | 锚点路径 | git 仓库根（worktree 独立地图），非 git 回退 cwd；子目录会话可命中根地图 |

### 3.1 与已移除 repo-map 方案的关系（历史沿革）

本设计与 2026-09-30 被移除的 `repo-map` 方案（git 历史：9eeaab83 设计文档 / fbca0b88 集成点 / 581463ca minified 修复 / 3c8aade6 注入修复 / bb04251e 移除文档）是**取代关系，非演进关系**：

| 维度 | 已移除 repo-map | 本设计 project-graph |
|---|---|---|
| 提取技术 | web-tree-sitter WASM（8MB 资产）+ IDF 图 + PageRank | 零依赖确定性扫描（路径/大小/启发式） |
| 形态 | 工具 `repo_map` + 会话自动注入快照 | 显式 `/initGraph` 生成 XML + 新建会话注入文件 |
| 更新 | TTL 快照 + 磁盘缓存 + 轮次级预热（异步） | 手动重建 + 陈旧警告（同步文件读取） |
| 符号级能力 | 自行实现（与两个检索 MCP 功能重叠） | 不实现，交由 codegraph / Codebase Memory MCP 承担 |

旧方案三个已实测故障根因，是本设计选择"确定性、有界、显式触发"的反向依据：
1. **缓存膨胀**：minified 单行文件使缓存达 394MB、首建超时 —— 本设计不解析文件内容，扫描 10k 文件硬上限；
2. **注入时机与 cwd 分叉**：预热与装配路径解析不一致导致注入静默失效 —— 本设计注入/状态/按钮共用同一 `resolveGraphRoot`，同步读取无预热；
3. **资产与依赖成本**：8MB WASM + 新依赖 —— 本设计零新增依赖。

## 4. 现状约束（已核查）

- 命令拦截：`useAgentInputActions.handleSendAction`（/compact 同构）；命令面板元数据 `BUILTIN_COMMAND_KEYS`（agentMarkdownInputUtils.ts:14）。
- System Prompt：`systemPromptManager.ts` 的 `registerSection` + `PROMPT_ORDERS`（MCP_GUIDANCE: 110，INSTRUCTIONS: 200，WORKSPACE_MEMORY: 250）；`buildSessionAgent` 经 `buildSystemPromptSync` 装配。
- 记忆先例：`<project>/.lx/memory/memory.xml` 不处理 gitignore；`.lx/` 在本仓库已在 `.gitignore`。
- 仓库根解析：`findGitRepoRoot`（instructionLoader.ts:50，sync + 5s 缓存）可复用。
- walk 先例：`walkFiles`（tools/search.ts:36，异步、.gitignore 感知、`maxResults` 上限）返回相对路径，不含大小。
- 主进程无工具 LLM 调用的先例：`btwAskGenerator.ts`（`resolveModelSelection` → `resolveLanguageModel` → `streamText` → `recordModelCall`，60s 超时）。
- 设置链路：`titleSummary` 走 `normalizeSelection(settings.titleSummary, providers, defaultModel)`（modelProviders.ts:317/355）；renderer `ModelSettings.tsx` 的 `MODEL_SELECTIONS` 驱动行渲染。
- 状态栏：`AgentStatusBar.tsx` 已按 `readOnly` 隐藏 jobs/permission；按钮组件在 `components/status-bar/`。
- IPC 四层：`shared/ipc/*Channels.ts` 常量 + `main/ipc/*Handlers.ts` + `preload/api/*.ts` + renderer feature API；`env.d.ts` Window 聚合 `*Api` 类型。
- usage：`UsagePurpose`（shared/contracts/usage.ts:12）+ `UsageRequestLogTable.tsx` 标签映射。

## 5. XML Schema（冻结）

```xml
<project_graph version="1" generated="2026-09-30T14:00:00Z"
               files="1243" truncated="false" stale="false"
               fingerprint="m3k9x2..." head="a1b2c3d" model="deepseek-v4">
  <stack>Electron 39 / React 19 / TypeScript 5.9 / pnpm</stack>
  <entrypoints>
    <entry path="src/main/index.ts" role="Main process bootstrap" />
  </entrypoints>
  <modules>
    <module path="src/main/agent" files="142">
      <desc>Agent runtime: sessions, tools, prompts, permissions</desc>
    </module>
  </modules>
  <keyfiles>
    <file path="package.json" />
  </keyfiles>
  <notice>Files changed since generation; treat as approximate. Re-run /initGraph for an accurate map.</notice>
</project_graph>
```

- 根属性：`version`（固定 `1`）、`generated`（ISO）、`files`（扫描文件数）、`truncated`、`stale`（`true|false|unknown`，写入文件时恒为 `false`，由注入渲染按实时比对改写）、`fingerprint`、`head`（git 短 HEAD，非 git 省略）、`model`（生成描述所用模型 id，骨架-only 时省略）。
- `<notice>` 仅陈旧注入时插入；`<desc>` 与 `<stack>` 文本统一英文；LLM 文本全部 XML 转义。
- 校验：`parseGraphXml` 根元素必须为 `project_graph`；损坏/非法 → `invalid`，不注入。

## 6. 数据结构与契约

### 6.1 shared 契约（`src/shared/contracts/graph.ts`）

```ts
export type GraphState = "none" | "fresh" | "stale" | "invalid" | "unknown"

export interface GraphStatus {
  state: GraphState
  generatedAt?: string
  files?: number
  model?: string
}

export interface GraphInitResult {
  ok: boolean
  mode?: "full" | "skeleton"
  error?: string
  warning?: string
}

export interface GraphApi {
  graph: {
    status: (projectPath: string) => Promise<GraphStatus>
    init: (projectPath: string) => Promise<GraphInitResult>
  }
}
```

### 6.2 IPC channel（`src/shared/ipc/graphChannels.ts`）

```ts
export const GRAPH_CHANNELS = {
  status: "graph:status",
  init: "graph:init",
} as const
```

### 6.3 main 模块布局（`src/main/agent/graph/`）

| 文件 | 职责 |
|---|---|
| `types.ts` | `GraphSkeleton`、`GraphModule`、`GraphFingerprint` 等内部类型 |
| `graphScanner.ts` | 有界扫描（ignore、深度、上限）、stack/entrypoints/keyfiles 启发式、指纹计算、锚点解析（git 根回退 cwd） |
| `graphXml.ts` | 序列化/解析/转义/合法性校验/注入预算裁剪（丢尾部 `<module>`） |
| `graphGenerator.ts` | 骨架先落盘 → LLM 描述 JSON → 合并重写；失败降级；per-project 并发去重；`recordModelCall({ purpose: "graph" })` |
| `graphStatus.ts` | `none/invalid/fresh/stale/unknown` 判定与元信息读取 |
| `graphPrompt.ts` | `formatProjectGraphPrompt(cwd)`：锚点解析 → 读取 → 校验 → stale 渲染 → 返回注入块或空串 |

### 6.4 renderer

- `features/agent/api/graphApi.ts`：`window.api.graph` 访问层。
- `features/agent/hooks/graphStore.ts`（zustand）：`{ projectPath, status, building, refresh(path), init(path) }`；按钮与命令共用，杜绝状态分叉。
- `features/agent/hooks/useGraphActions.ts`：store + toast 组合（文案走 i18n），供 AgentPage 接线。
- `status-bar/MapStatusButton.tsx`：三态 + 生成中；tooltip 内容与动作。
- 命令链路：`AgentPage → AgentInput → AgentMarkdownInput → useAgentInputActions` 新增 `onInitGraph`；`onInitGraph` 缺失（btw/无项目）→ warning 拒绝。

### 6.5 设置

- `shared/settings.ts`：`ModelProviderSettings.graphModel: ModelSelection`；`rawConfig.ts` 增 `graphModel?: Partial<ModelSelection>`；`modelProviders.ts` 读写两处 `normalizeSelection(..., defaultModel)`。
- `ModelSettings.tsx`：`MODEL_SELECTIONS` 增 `{ key: "graphModel", labelKey: "settings.graphModel" }`。
- `shared/contracts/usage.ts`：`UsagePurpose` 增 `"graph"`；usage 表格与 zh/en locale 增标签。

## 7. 实现方案

### 7.1 扫描器

- 锚点：`resolveGraphRoot(cwd) = findGitRepoRoot(cwd) ?? cwd`。
- 遍历：同步递归 readdir（主进程注入路径必须同步）；跳过 `.git`、`node_modules`、`dist`、`out`、`build`、`release`、`coverage`、`.vite`、`.codegraph`、`.codebase-memory`、`.lx`、隐藏目录与符号链接；目录级 `.gitignore` 规则栈复用 search.ts 同款逻辑（本地实现，走 `ignore` 包）。
- 上限：`MAX_SCAN_FILES = 10_000`；超限停止收集 → `truncated=true` 且指纹 `unknown`。
- `stack`：`package.json` 依赖信号（electron/react/typescript/vue/next 等取前若干）+ 锁文件（pnpm-lock.yaml / package-lock.json / yarn.lock / bun.lock）；无 package.json 时识别 `go.mod`/`Cargo.toml`/`pyproject.toml`/`pom.xml`。
- `entrypoints`：`package.json` 的 `main`/`bin` 优先，叠加常见路径命中（`src/main/index.ts`、`src/preload/index.ts`、`src/renderer/src/main.tsx`、`src/index.ts`、`main.py`、`cmd/*/main.go`、`src/main.rs` 等），上限 8 条。
- `modules`：深度 ≤3、含源码文件（按扩展名集合判定）的目录；BFS 顺序；`files` 为该目录直接子文件数。
- `keyfiles`：根级清单/配置（package.json、tsconfig*.json、vite/electron 配置、biome.json、Dockerfile、Makefile、Lock 文件、README.md 等），上限 12。
- 指纹：`sha256(sorted("relPath:size"))` 截断 16 位 + `head`（git 短 HEAD）。

### 7.2 生成器

1. `scanProjectTree` → 组装骨架 XML → **立即落盘**（保证 LLM 失败也有地图）。
2. 取 `getModelProviderSettings().graphModel` → `resolveModelSelection`；不可用 → 返回 `{ ok: true, mode: "skeleton", warning }`。
3. 输入：骨架模块清单（path + files + 每模块限量文件名，总输入截断上限）；系统提示词英文，要求输出严格 JSON 映射（只允许出现骨架中存在的路径，未命中丢弃，描述 ≤200 字符）。
4. `streamText` + 60s 超时 → 解析 JSON（容忍 ```json 围栏）→ 合并 `<desc>` → 重写 XML（含 `model` 属性）→ `recordModelCall`。
5. 并发：模块级 `Map<root, Promise<GraphInitResult>>` 去重，重复调用返回进行中结果（`ok:false` + "already in progress" warning）。
6. 超时/异常/JSON 非法 → 保留已落盘骨架，返回 `{ ok: true, mode: "skeleton", warning }`。

### 7.3 状态与注入

- `getGraphStatus(root)`：文件不存在 → `none`；解析失败 → `invalid`；扫描超限 → `unknown`；指纹相符 → `fresh`；不符 → `stale`。
- `formatProjectGraphPrompt(cwd)`：锚点解析 → 读取 → 校验（非法返回空串）→ 按实时比对写 `stale` 属性并插 `<notice>` → 预算裁剪至 ≤24KB → 返回。
- `systemPromptManager`：`PROMPT_ORDERS.PROJECT_GRAPH = 120`、`PROMPT_SECTION_NAMES.PROJECT_GRAPH = "agent:project-graph"`；`literal: true`；`ctx.cwd` 缺失返回空串。

### 7.4 IPC 与 Handler

- `graphHandlers.ts`：`requireString(projectPath)` 校验 + 路径存在性校验；`graph:status` → `getGraphStatus`；`graph:init` → `generateProjectGraph`；注册进 `src/main/index.ts`。
- preload `api/graph.ts` + `index.ts` 聚合 + `env.d.ts` Window 增 `GraphApi`。

### 7.5 按钮与命令交互

```
无地图   [Map 暗灰]   → "No project map. Initialize now?" [Initialize]
新鲜     [Map 青绿]   → Map · {files} files · generated {time} [Re-initialize]
陈旧     [Map 琥珀•]  → "Map may be outdated (files changed since generation)." [Re-initialize]
生成中   [Loader2 转] → 禁点；tooltip "Building map…"
```

- 图标选 `lucide-react` 的 `Map`；陈旧态叠加角标点；颜色使用主题 Token（禁硬编码背景色）。
- 命令：`/initGraph` 加入 `BUILTIN_COMMAND_KEYS`；拦截时清空输入并调用 `onInitGraph`；执行中按钮转圈；完成 toast 区分 `full`（成功）/`skeleton`（警告）/失败（错误）。
- 状态刷新：projectPath 变化与 init 完成后各拉一次 `graph:status`；无轮询。
- btw 变体、无 projectPath、`readOnly`：按钮隐藏、命令拒绝（warning）。

## 8. 测试与验收

- main：扫描器（ignore/上限/确定性/启发式）、XML（round-trip/转义/损坏/预算裁剪）、状态（5 态）、生成器（mock `streamText`：full/skeleton/超时/JSON 非法/并发去重）、prompt 注入（stale/notice/非法跳过）、`graphHandlers`（注册 + 入参校验）。
- renderer：`/initGraph` 拦截与 btw 拒绝（AgentInput 测试模式）、`graphStore` 状态迁移、`MapStatusButton` 三态与 tooltip 动作、readOnly 隐藏、`ModelSettings` 地图模型行。
- 契约：preload 新 channel 转发断言；shared 常量唯一来源。
- 验证命令：受影响文件 `vitest run` + `pnpm typecheck` + biome format；不启动应用（用户手动验收）。

## 9. 风险与降级

- LLM 不可用/超时/输出非法：骨架照常可用，仅缺描述（warning 可见）。
- 地图文件被手工改坏：`invalid` 不注入、按钮按陈旧态提示重建。
- 巨型仓库：扫描 10k 上限截断，`truncated` + `stale=unknown` 显式降级，不阻塞会话装配。
- 子目录会话 / worktree：锚点统一走 git 根，各 worktree 独立地图，互不污染。
