# Token Usage 统计设计

参考 `cc-switch` 的使用统计形态，在 LX Agent 中新增请求日志采集、手动计价与成本计算，并在主页侧栏新增 Usage 入口与统计页面（汇总卡 + 图表 + 表格）。

## 1. 目标与非目标

### 目标

- 每次模型请求（AI SDK step）落一条 usage 日志：provider/model/token/成本/耗时/状态。
- 模型配置支持手动填写单价（USD / 百万 token），成本在写入时计算并快照。
- 主页用量统计视图（`?view=usage` 组件切换）：汇总卡 + 5 图 + 3 表（请求日志 / 模型统计 / Provider 统计），支持时间范围、Provider、Model、Project 筛选。
- 默认时间范围为「今日」。
- 日志写入后通过 IPC 事件推送，页面实时刷新。

### 非目标

- 不回填历史会话的用量（日志即事实，上线后开始记录）。
- 不做远程价目表同步（models.dev 等）。
- 不做日志清理 / 归档策略。
- 不改动会话消息中已持久化的 `Usage` 展示语义（仅扩展字段）。

## 2. 数据契约（`src/shared/contracts/usage.ts`）

### 2.1 Usage 扩展

`src/shared/contracts/agent.ts` 的 `Usage` 增加 `cacheWrite`。AI SDK v6 中 `inputTokens` 是**总量**（含 `cacheRead` + `cacheWrite`），读取时同步取 `inputTokenDetails.cacheWriteTokens`。

```ts
export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
}
```

旧消息 payload 无 `cacheWrite` 字段，读取侧按 `?? 0` 兼容。

### 2.2 计价与成本

```ts
// 每百万 token 的美元单价（用户手动配置）。
export interface ModelPricing {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface UsageRates {
  inputCostUsd: number | null
  outputCostUsd: number | null
  cacheReadCostUsd: number | null
  cacheWriteCostUsd: number | null
  totalCostUsd: number | null
}

// 纯函数：未配置 pricing 时全部返回 null；noCache 做非负钳制。
export function computeUsageRates(usage: UsageTokens, pricing?: ModelPricing): UsageRates
```

成本公式（`noCache = max(0, input - cacheRead - cacheWrite)`）：

```text
noCache * inputPrice / 1e6
+ cacheRead * cacheReadPrice / 1e6
+ cacheWrite * cacheWritePrice / 1e6
+ output * outputPrice / 1e6
```

未配置 `pricing` 的模型成本为 `null`，UI 显示 `--`；聚合成本只累加非 null 行。

### 2.3 日志与查询 DTO

```ts
export type UsagePurpose = "chat" | "subagent" | "compaction" | "title" | "suggested"
export type UsageLogStatus = "success" | "error" | "aborted"

export interface UsageLogInput {
  sessionId?: string | null
  projectId?: string | null
  purpose: UsagePurpose
  provider: string
  model: string
  usage: UsageTokens            // input/output/cacheRead/cacheWrite
  durationMs?: number | null
  status: UsageLogStatus
  errorMessage?: string | null
  createdAt?: number            // 缺省 Date.now()
}

export interface UsageLogRecord extends UsageLogInput {
  id: number
  externalId: string
  rates: UsageRates
  createdAt: number
}

export interface UsageQuery {
  startTime?: number
  endTime?: number
  provider?: string
  model?: string
  projectId?: string
}
```

聚合类型：`UsageSummary`（请求数/各类 token/总成本/成功率/平均耗时）、`UsageDailyPoint`、`UsageModelStats`、`UsageProviderStats`、`UsageLogPage`（rows/total/page/pageSize）。

服务内 `buildWhere(query)`：把查询 DTO 转成 WHERE 条件与参数。


## 3. 表结构（迁移 `0010_create_usage_log`）

```sql
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  session_id TEXT,            -- 快照，无 FK：会话删除不影响日志
  project_id TEXT,            -- 快照，无 FK
  purpose TEXT NOT NULL,      -- chat | subagent | compaction | title | suggested
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  input_cost_usd REAL,        -- NULL = 未配置单价
  output_cost_usd REAL,
  cache_read_cost_usd REAL,
  cache_write_cost_usd REAL,
  total_cost_usd REAL,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','aborted')),
  error_message TEXT,
  created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_usage_log_created ON usage_log(created_at DESC);
CREATE INDEX idx_usage_log_model ON usage_log(model);
CREATE INDEX idx_usage_log_provider ON usage_log(provider);
CREATE INDEX idx_usage_log_project ON usage_log(project_id);
```

## 4. 写入链路

### 4.1 `main/services/usageLogService.ts`

仿 `overviewService` 的工厂模式（`createUsageLogService(getConnection)`），提供：

- `record(input: UsageLogInput, pricing?: ModelPricing | null): void` —— 按传入价格快照成本并 INSERT（价格解析在调用方 `usageRecorder`，服务不依赖配置）。
- `listLogs(query, page, pageSize): UsageLogPage`
- `getSummary(query): UsageSummary`
- `getDaily(query): UsageDailyPoint[]`（按本地日聚合）
- `getModelStats(query): UsageModelStats[]`
- `getProviderStats(query): UsageProviderStats[]`
- `getFilterOptions(query): { providers: string[]; models: string[]; projects: { id: string; name: string }[] }`

聚合 SQL 统一复用 `buildWhere` 的 WHERE 片段；成功率 = success / 总数；耗时均值忽略 NULL。

### 4.2 `main/agent/usageRecorder.ts`

- `recordModelCall(input)`：补全 `projectId`（按 `sessionId` 查 `agent_session.project_id`，带缓存）、调用 `usageLogService.record`、广播 `USAGE_CHANNELS.event`。
- `resolveUsageContext(sessionId)`：session 查询与 pricing 解析的纯逻辑部分可测。
- pricing 来源：`getModelProviderSettings()` → `providers[provider].models[modelKey].pricing`（按 model key 或 model.id 匹配）。

### 4.3 采集点

| 调用点 | purpose | sessionId | 粒度 |
| --- | --- | --- | --- |
| `aiSdkStreamFn`（sessionRunner 创建） | `chat` | 有 | 每次调用一条（stopWhen 单 step） |
| `aiSdkStreamFn`（task.ts 创建） | `subagent` | 有（父会话） | 每次调用一条（stopWhen 单 step） |
| `generateCompactionSummary` 调用处（contextCompactor） | `compaction` | 有 | 每次一条 |
| `generateSessionTitle` | `title` | 有（调用方传入） | 每次一条 |
| `generateTemplateTitle` | `title` | 无 | 每次一条 |
| `generateSuggestedQuestions` | `suggested` | 无 | 每次一条 |

实现约定：

- `createAiSdkStreamFn(options?: { purpose; getSessionId?: () => string | null })`：适配器以 `stopWhen: stepCountIs(1)` 执行，每次调用即单个请求，`finish` 读取 `totalUsage` 落库；流异常/中断在 error/abort 分支按 `error`/`aborted` 落库（无 usage 时 token 记 0）。
- 单次生成调用点：在拿到 `result` 后读取 `await result.usage`，成功/失败均记录。标题与建议问题的原有 catch 行为不变，只新增日志副作用。
- `Usage` 读取统一走 `toUsage(usage?: LanguageModelUsage): Usage` 辅助函数（含 cacheWrite 与默认值）。
- title/suggested 的失败路径记录 status=`error`，errorMessage 取异常 message。

### 4.4 事件推送

`USAGE_CHANNELS.event = "usage:event"`，payload `{ type: "logRecorded" }`。`registerUsageHandlers(getWebContents)` 与 agent/openclaw 同样在 `main/index.ts` 注册，写入方通过回调 `getWebContents()` 推送；页面挂载期间收到事件后重新拉取。

## 5. IPC 与 preload

- `src/shared/ipc/usageChannels.ts`：`listLogs / getSummary / getDaily / getModelStats / getProviderStats / getFilterOptions` + `event`。
- `src/main/ipc/usageHandlers.ts`：参数边界校验（时间戳、分页范围、字符串长度）后调用 service。
- `src/preload/api/usage.ts`：`window.api.usage.*`，`onEvent(handler)` 返回退订函数（仿 `agent.onEvent`）。
- `src/preload/index.ts` 注册 `usage` 域。

## 6. Renderer 结构

```text
features/usage/
  api/usageApi.ts             # 唯一访问 window.api.usage
  hooks/useUsageData.ts       # 查询、筛选状态、事件订阅、手动/自动刷新（时间范围按加载时刻实时解析）
  components/
    UsageSummaryCards.tsx
    UsageTrendChart.tsx        # 每日 Token（堆叠：noCache/输出/缓存读/缓存写）+ 成本折线，双轴
    UsageRequestsChart.tsx     # 每日请求数柱状
    UsageModelStatsTable.tsx
    UsageProviderStatsTable.tsx
    UsageRequestLogTable.tsx   # 分页表格
    UsageModelDistributionChart.tsx   # Top N 横向条形（成本）
    UsageProviderDistributionChart.tsx # 环形（成本）
    UsageTokenCompositionChart.tsx     # input/output/cacheRead/cacheWrite 构成
    UsageFilters.tsx           # 时间预设 + Provider/Model/Project 级联 + 自动刷新（默认关闭，5s/10s/30s）
  types.ts / utils.ts / index.ts
```

- 图表库：`recharts@^3.5.1`（与 cc-switch 一致，支持 React 19）。
- 所有样式使用 CSS Token（`--color-theme-*` 等），圆角 6px，禁止渐变。
- 全部文案接入 `useTranslation`，`zh.ts` / `en.ts` 同步新增 `usage.*` 键。

## 7. 导航与侧栏（组件内切换，不新增路由）

对齐设置页 `?section=` 模式，用量统计是主页内的组件切换，不注册独立路由：

- `HomePage` 读取 `?view=`（`lib/homeView.ts` 解析，缺省 `overview`），渲染 `OverviewDashboard` 或 `UsageDashboard`。
- `HomeLeftSideBar` 两项（概览 / 用量统计），点击导航 `/` 或 `/?view=usage`，激活态由 `view` 查询参数驱动；折叠态两个图标按钮；禁止使用原生 `title`（已有 Tooltip 约定）。
- 不新增 `PAGE_ROUTES`，`App.tsx` 侧栏条件保持 `pathname === home`。

## 8. 主题兼容

- 所有卡片、表格、按钮、图表坐标轴/网格/hover cursor 一律使用 `--color-theme-*` Token，禁止硬编码白色透明度或固定底色。
- 表格行 hover 使用 `--color-theme-surface-hover`；表头与边框使用 `--color-theme-border` / `--color-theme-text-muted`。
- recharts 关闭 `accessibilityLayer`（避免焦点黄框），Tooltip cursor 使用主题边框色。
- 用量卡片/表格挂 `usage-stat-card` / `usage-chart-card` / `usage-table-card` / `usage-table` / `usage-chart-tooltip` 类，与 `overview-*` 共用我的世界主题浮雕规则组。
- 自动刷新默认关闭（0ms），可选 5s / 10s / 30s；手动刷新按钮不因加载中禁用。
- 测试期间通过 `LX_AGENT_DATA_ROOT` 将应用数据根目录隔离到临时目录，禁止测试写入真实 `~/.lx`。

## 9. 计价配置 UI

- `ModelProviderModel` 增加 `pricing?: { input; output; cacheRead; cacheWrite }`（USD / 百万 token）。
- `ModelProviderSettings.tsx` 模型卡展开区新增 4 个数字输入（与 context/output 同网格），空值 = 不参与成本计算。
- 设置保存沿用现有 `settingsService` 流程，无数据库迁移。

## 10. 测试策略

- `test/shared/contracts/usage.test.ts`：`computeUsageRates`（含 clamp、未配置、四段成本求和）、`resolveUsageRange`。
- `test/main/services/usageLogService.test.ts`：内存 SQLite 迁移后记录/查询/聚合/筛选/分页；未配置价格成本为 null。
- `test/main/agent/usageRecorder.test.ts`：pricing 解析、session → project 快照、事件广播回调。
- `test/renderer/features/usage/`：格式化工具、汇总卡、表格空态/数据态、筛选联动 hook。
- 验证命令：`pnpm test`（受影响文件）、`pnpm typecheck`、`pnpm lint`。

## 11. 风险与取舍

- 标题 / 建议问题的调用链无 sessionId，此类日志不参与 Project 筛选。
- 成本使用 SQLite REAL 存储；展示保留 4~6 位小数，不做货币精度审计。
- `cacheWrite` 仅 Anthropic 系提供，其他 provider 恒为 0。
- 数据只从上线后开始，历史会话用量不可见（已确认为非目标）。
