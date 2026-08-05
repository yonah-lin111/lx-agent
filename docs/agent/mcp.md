# MCP 工具接入

本文定义 LX Agent 的 MCP（Model Context Protocol）接入形态：配置 schema、连接与生命周期、工具适配。接入逻辑参考 [opencode-dev](https://github.com/anomalyco/opencode) 的 `packages/opencode/src/mcp/` 与 `packages/core/src/config/mcp.ts`；本页只覆盖 **local stdio**，remote / OAuth 留口（见 §6）。

## 1. 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 传输 | **仅 local stdio**（spawn 子进程 + stdio 协议）；无 HTTP / SSE / OAuth |
| 2 | 配置位置 | `~/.lx/config.json` 的 **`agent.mcp`** 节点（与 `agent.pages` 同层，Agent 能力内聚） |
| 3 | 启用策略 | item 会话**配置即启用**（连上的 server 工具全部进激活集）；`agent.pages[route].mcp` 允许列表仅覆盖页面会话 |
| 4 | 命名 | MCP 工具**一律前缀化** `sanitize(server)_sanitize(tool)`，防与内置工具/跨 server 冲突 |
| 5 | 失败语义 | 单 server 连接失败**降级不阻塞**：记 failed 状态（日志），其工具不进注册表，其余照常 |
| 6 | 会话快照 | 恢复历史会话时**按当前配置重载**；快照 `mcp[]` 仅展示与校验 |

## 2. 配置 schema

```jsonc
// ~/.lx/config.json
{
  "ai": { /* ... 现有模型 provider 配置不变 */ },
  "agent": {
    "pages": { /* ... 现有页面能力允许列表 */ },
    "mcp": {
      "codegraph": {
        "command": ["codegraph", "serve", "--mcp"],   // 必填：可执行命令 + 参数
        "cwd": "/abs/or/relative/to/workspace",        // 可选：server 进程工作目录
        "environment": { "KEY": "value" },             // 可选：附加环境变量（合并到 process.env）
        "disabled": false,                             // 可选：显式停用该 server
        "timeout": 30000                               // 可选：连接初始化超时（ms），默认 30000
      }
    }
  }
}
```

字段对齐 opencode `Local`：`command: string[]`（必填）、`cwd?`、`environment?`、`disabled?`、`timeout?`。

读取沿用 `settingsService` 的 `readRawConfig(getConfigPath())`，新增 `getMcpServers(): Record<string, McpServerConfig>`（非法条目跳过并记警告）。

## 3. 连接与生命周期

新增 `src/main/agent/mcp/mcpManager.ts`，进程内单例，状态 `Record<serverName, {status, tools, error?}>`：

| 生命周期 | 行为 |
|----------|------|
| 初始化 | 读 `agent.mcp` 配置；`disabled: true` 或缺失 `command` → 标 disabled；逐 server spawn 连接（并发） |
| 连接 | `StdioClientTransport({ command, args, cwd, env: {...process.env, ...server.environment} })` → `client.connect(timeout)` |
| 列工具 | 连接成功后 `listTools` 分页拉全（`nextCursor` 循环，上限 1000 页、游标去重）；list 失败按空处理 |
| 状态 | `connected` / `disabled` / `failed(error)`；失败记日志不抛 |
| 监听 | `client.onclose` → 标 failed 并清理缓存；`ToolListChangedNotification` → 重新拉取工具列表 |
| 断开 | `disconnectAll()`：close 全部 transport（SDK 终止子进程），挂 `app.on('quit')` |

工具缓存暴露：`getTools(): McpToolHandle[]`（`{ server, def, client }`，仅 connected）。

## 4. 工具适配（MCP → AgentTool）

`@modelcontextprotocol/sdk@^1.29.0` 已是项目依赖。MCP 工具经 **Adapter 模式**包成 `AgentTool`，无需改 loop / `toAiTools`（后者自动映射 zod schema）：

```ts
function wrapMcpTool(server: string, def: MCPToolDef, client: MCPClient, cwd: string): AgentTool {
  return {
    name: `${sanitize(server)}_${sanitize(def.name)}`,   // 前缀化，防冲突
    label: def.name,
    description: def.description ?? "",
    inputSchema: jsonSchemaToZod(def.inputSchema),        // JSON Schema → zod；无法无损转换降级宽松 schema
    executionMode: "sequential",                          // MCP 工具视为有副作用，串行
    execute: async (toolCallId, params, signal, onUpdate) => {
      const result = await client.callTool(
        { name: def.name, arguments: params },
        CallToolResultSchema,
        { signal, timeout, onprogress: () => {} },        // onprogress 钩子使 SDK 发送进度 token，启用超时重置
      )
      if (result.isError) throw new Error(文本拼接)          // 抛错 → loop 转为 error toolResult
      if (result.content.length > 0 || result.structuredContent == null) return { content: [text] }
      return { content: [{ type: "text", text: JSON.stringify(result.structuredContent) }] }  // structuredContent 兜底
    },
  }
}
```

schema 转换 `jsonSchemaToZod`（`src/main/agent/mcp/jsonSchemaToZod.ts`）：

- 递归支持 `object`（properties/required）、`string`/`number`/`boolean`/`null`、`array`、`enum`、`anyOf` 简化。
- 无法无损转换（含 `oneOf`、自引用 `$ref` 解析失败等）→ 降级 `z.record(z.unknown())`，运行时透传。
- 对齐 opencode `convertTool` 的 `type: "object"` + `additionalProperties: false` 约束；`zod v4` 提供 `z.toJSONSchema`，反向转换自实现。

## 5. 与现有代码的接线

| 位点 | 改动 |
|------|------|
| `agentRunner.prepareBinding()` | 计算 MCP 激活集：item 会话取 `mcpManager.getTools()` 全量（配置即启用），页面会话按 `getPageCapabilities(route).mcp[]` 允许列表与已连接工具求交 |
| `agentRunner.ensureReady()` | `createRegistry` 内注册 `mcpManager.getTools()` 包装的 AgentTool；按允许列表过滤（页面会话）或全量（item 会话）后 `setActive` |
| `agentRunner.beginSessionTurn()` | `active_capabilities` 快照的 `mcp[]` 记实际生效清单（仅展示/校验，恢复时不据此重建） |
| `agentRunner.restoreSession()` | 恢复历史会话时按当前配置重载 MCP 激活集；快照 `mcp[]` 仅展示/校验 |

## 6. 演进留口（v2+）

- **remote / OAuth**：`config.mcp` 支持 `{ type: "remote", url, headers?, oauth? }`，需要 token 存储 + 回调端口 + `needs_auth` 状态机（opencode `src/mcp/oauth-*.ts`）。当前无 OAuth 基建，v1 不做。
- **MCP 状态 UI**：`mcpManager.getStatus()` 已暴露，后续 `/` 命令面板可加 `mcp status`。
- **权限门控**：敏感 MCP 工具的确认流程挂 `beforeToolCall`（见 `harness.md` 信任模型演进），v1 与内置 bash/write 一致无门控。

## 7. 验收

- 配置 `agent.mcp` 后启动，MCP 工具出现于 `toAiTools` 产物（模型可调用）。
- 工具名均为 `server_tool` 前缀格式；与内置工具/跨 server 无重名。
- 单个 server 配置错误（坏命令/缺失二进制）不影响其他能力；日志有 failed 记录。
- 断开（应用退出 / 重载配置）时无残留子进程。
