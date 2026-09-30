# 项目地图（project-graph）任务拆解

> 设计：`docs/feature/project-graph/design.md`
> 工作区：`.worktrees/feat-project-graph`（分支 `feat/project-graph`，从 `dev` 切出）
> 说明：grill 1-14 决策见设计第 3 节；XML Schema 见设计第 5 节（冻结）。

## 阶段 0：工作区准备

### T0 创建 git 工作区

- **步骤**
  1. `git worktree add .worktrees/feat-project-graph -b feat/project-graph dev`
  2. 工作区内执行 `node scripts/setupWorktreeNodeModules.mjs`（链接主仓库 `node_modules`）。
- **期望**：工作区独立可跑测试与构建；主工作区 `dev` 仅多出本文档目录的提交。

## 阶段 1：shared 层

### T1 graph 契约与通道

- **步骤**
  1. 新增 `src/shared/contracts/graph.ts`：`GraphState`、`GraphStatus`、`GraphInitResult`、`GraphApi`（设计 6.1）。
  2. 新增 `src/shared/ipc/graphChannels.ts`：`GRAPH_CHANNELS = { status: "graph:status", init: "graph:init" }`。
- **期望**：channel 与 DTO 只定义一次，main/preload/renderer 复用。

### T2 settings 与 usage 扩展

- **步骤**
  1. `src/shared/settings.ts`：`ModelProviderSettings` 增 `graphModel: ModelSelection`。
  2. `src/shared/contracts/usage.ts`：`UsagePurpose` 增 `"graph"`。
- **期望**：renderer settings 类型经 re-export 自动生效。

## 阶段 2：main 层核心

### T3 扫描器 `graphScanner.ts`

- **步骤**
  1. `resolveGraphRoot(cwd)`（git 根回退 cwd）；同步有界递归扫描（ignore 规则、`MAX_SCAN_FILES=10000`、跳过隐藏/构建/索引目录与符号链接）。
  2. stack / entrypoints / keyfiles 启发式；modules（深度 ≤3、BFS、源码扩展名判定）。
  3. 指纹：`sha256(sorted("relPath:size"))` 截断 16 位 + git 短 HEAD。
- **期望**：同输入同输出；超限 `truncated=true` 且指纹 `unknown`。

### T4 XML `graphXml.ts`

- **步骤**
  1. `serializeGraph`（全量转义）；`parseGraphXml`（htmlparser2 xmlMode，根 `project_graph` 校验）。
  2. `renderGraphForPrompt`：实时 `stale` 属性 + `<notice>` + 24KB 预算裁剪（丢尾部 `<module>`）。
- **期望**：round-trip 稳定；畸形 XML 返回 null。

### T5 生成器 `graphGenerator.ts`

- **步骤**
  1. 骨架先落盘 → LLM 描述（`graphModel`，60s 超时，严格 JSON 映射）→ 合并重写。
  2. 失败降级 `{ ok: true, mode: "skeleton", warning }`；per-project 并发去重；`recordModelCall({ purpose: "graph" })`。
- **期望**：LLM 不可用不阻塞地图可用；重复触发不并发执行。

### T6 状态与注入

- **步骤**
  1. `graphStatus.ts`：`none/invalid/fresh/stale/unknown` 判定。
  2. `graphPrompt.ts`：`formatProjectGraphPrompt(cwd)`（非法不注入、无 cwd 返回空串）。
  3. `systemPromptManager.ts`：`PROMPT_ORDERS.PROJECT_GRAPH = 120`、section `agent:project-graph`、`literal: true`。
- **期望**：新建会话装配注入；陈旧时带 `stale="true"` 与 `<notice>`。

## 阶段 3：main IPC 与设置服务

### T7 `graphHandlers.ts` 与注册

- **步骤**
  1. 入参校验（string + 路径存在）；`graph:status` / `graph:init`；注册进 `src/main/index.ts`。
- **期望**：两个 channel 均有 handler 与错误语义。

### T8 settingsService 接线

- **步骤**
  1. `rawConfig.ts` 增 `graphModel?: Partial<ModelSelection>`。
  2. `modelProviders.ts` 读写两处 `normalizeSelection(settings.graphModel, providers, defaultModel)`。
- **期望**：缺省回退 defaultModel；保存透传。

## 阶段 4：preload 与 renderer

### T9 preload

- **步骤**
  1. `preload/api/graph.ts` + `preload/index.ts` 聚合 `graph`；`env.d.ts` Window 增 `GraphApi`。
- **期望**：最小白名单，仅 `status`/`init`。

### T10 renderer store 与 API

- **步骤**
  1. `features/agent/api/graphApi.ts`；`hooks/graphStore.ts`（zustand）；`hooks/useGraphActions.ts`（store + toast + i18n）。
- **期望**：按钮与命令共用同一状态源。

### T11 状态栏按钮与接线

- **步骤**
  1. `components/status-bar/MapStatusButton.tsx`（三态 + 生成中 + tooltip `trigger="both"` 动作）。
  2. `AgentStatusBar` 接入（readOnly/无项目隐藏）；`AgentPage` 传参。
- **期望**：无地图 tooltip 询问初始化；有地图展示元信息与重建动作。

### T12 `/initGraph` 命令链路

- **步骤**
  1. `BUILTIN_COMMAND_KEYS` 增 `{ id: "initGraph", name: "/initGraph", descKey, kind: "builtin" }`。
  2. `onInitGraph` 链路（AgentPage → AgentInput → AgentMarkdownInput → useAgentInputActions）；`handleSendAction` 拦截 + `executeCommand` 分支。
  3. `onInitGraph` 缺失（btw/无项目）→ warning 拒绝。
- **期望**：命令与按钮行为一致；发送前清空输入。

### T13 设置行与 i18n

- **步骤**
  1. `ModelSettings.tsx` 增 `graphModel` 行；settings zh/en locale 增标签。
  2. agent zh/en locale：命令描述、按钮 tooltip、三种 toast；usage zh/en：`purpose.graph`；`UsageRequestLogTable` 标签映射。
- **期望**：全部 UI 文案走 `t()`，无硬编码中文。

## 阶段 5：测试与验收

### T14 main 测试

- `test/main/agent/graph/`：扫描器、XML、状态、生成器（mock `streamText`）、prompt 注入。
- `test/main/ipc/graphHandlers.test.ts`：注册 + 入参校验。

### T15 renderer / preload 契约测试

- `/initGraph` 拦截与 btw 拒绝；`graphStore` 迁移；`MapStatusButton` 三态；`ModelSettings` 行；preload channel 转发。

### T16 校验与提交

- **步骤**
  1. 受影响范围 `vitest run` + `pnpm typecheck` + 受影响文件 biome format。
  2. worktree 提交代码与测试；回报用户询问是否合并。
- **期望**：无旧导入残留、无重复 DTO/通道；测试全绿。
