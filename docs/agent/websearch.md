# 联网搜索（web_search）

本文定义 LX Agent 的联网搜索接入形态：provider 策略、配置 schema、工具契约与渲染展示。搜索 API 复用 [memory-curator-agent](https://github.com/yibizhiniao/memory-curator-agent) 的 `webSearchTool`（Exa MCP 为主、Tavily 兜底），配置沿用本项目 `~/.lx/config.json`。

## 1. 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | Provider | **Exa 优先，Tavily 兜底**：同一搜索先试 Exa（`mcp.exa.ai` MCP），失败回退 Tavily（`api.tavily.com`）；固定顺序，不做轮询 |
| 2 | 无 Key 行为 | **保留匿名直连**：未配置 Key 时仍发起请求（Exa 直连无认证参数、Tavily 无 Authorization 头）；匿名被拒（401/403）的 provider 在配置 Key 前**暂停重试**，避免反复打无效服务 |
| 3 | 失败语义 | 可用 provider 全部失败时抛**英文失败提示**（回灌模型 + 展示侧红色标注），提示 `~/.lx/config.json` 配置 Key |
| 4 | 配置位置 | `~/.lx/config.json` 的 **`ai.webSearch`** 节点（`exaApiKey` / `tavilyApiKey`），与 `agent.mcp` 平级而属于 `ai` 段 |
| 5 | 能力激活 | `web_search` 进**内置工具全集**：所有会话默认启用（全量默认能力集），无页面裁剪 |
| 6 | 渲染形态 | 专用展示块 **`AgentWebSearchBlock`**（`text-emerald-300` 独立配色），**不参与普通工具折叠**；连续多次搜索合并为 `[条件1], [条件2]` 单行展示，不展示搜索正文 |

## 2. 配置 schema

```jsonc
// ~/.lx/config.json
{
  "ai": {
    "webSearch": {
      "exaApiKey": "exa-xxxx",     // 可选：Exa API Key（空则匿名直连）
      "tavilyApiKey": "tvly-xxxx"  // 可选：Tavily API Key（空则匿名直连）
    }
  }
}
```

读取沿用 `settingsService` 的 `getConfigPath()` 模式，`createWebSearchTool` 内 `readWebSearchConfig()` 解析 `ai.webSearch`（缺失/非法返回空 Key，不抛错）。

## 3. 工具契约

内置工具 `web_search`（`src/main/agent/tools/webSearch.ts`）：

| 字段 | 值 |
|------|-----|
| name | `web_search` |
| label | 联网搜索 |
| 参数 | `{ query: string(1..500); numResults?: number(1..10, 默认 8); type?: "auto"\|"fast"\|"deep"（默认 auto） }` |
| executionMode | parallel（只读，无副作用） |

执行流程：读取 `ai.webSearch` → 归一化 provider 可用集（有 Key 或未被匿名拒绝）→ 固定先 Exa 后 Tavily → 命中返回文本观察结果（`content` 回灌模型，`details` 记录 `query/numResults/type/provider`）。

## 4. 渲染展示

连续的同名 `web_search` 调用在 `AgentMessageItem` 中归并为独立 `webSearch` 分组，交给 `AgentWebSearchBlock` 渲染：

- 头部：`Search` 图标 + **`Web Search`**（`text-emerald-300`，区别于 MCP 的 cyan / Skill 的 violet / 普通工具折叠的 amber）。
- 正文：搜索条件以**方括号包裹、逗号分隔**单行展示，如 `[react hooks 文档], [tailwind v4 发布]`。
- 失败：组内全部调用 `status === "error"` 时头部追加红色 `· Web search failed`（与工具抛出的英文失败提示语义一致）。
- 不展示搜索正文；结果仅回灌模型，由模型组织成回答。

## 5. 设计参考

- provider 调用细节（Exa MCP JSON-RPC `web_search_exa` / Tavily `/search`、25s 超时、SSE 响应解析）对齐 memory-curator-agent `src/main/agent/tools/webSearchTool.ts`。
- 工具注册与激活集装配见 [extensions.md](./extensions.md) §2 / §3。
