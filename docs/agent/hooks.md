# 生命周期钩子（Lifecycle Hooks）

本文档定义 LX Agent 的用户级生命周期钩子（Harness）体系：事件集、配置 schema、子进程线协议、失败语义与调用点接线。

相关文档：[tools.md](./tools.md) 工具与扩展体系；[permissions.md](./permissions.md) 权限门控；[runtime.md](./runtime.md) 运行时管理。

---

## 1. 架构总览

```text
~/.lx/config.json → agent.hooks
        │
        ▼
hookConfig（zod 校验 + matcher 解析 + 会话级缓存）
        │
        ▼
hooksManager.dispatch（串行派发，配置顺序即执行顺序）
        │
        ├─ commandRunner：一次性子进程（stdin JSON / LX_* env / 超时杀进程树 / 输出 1MB 截断）
        ├─ outputParser：严格 JSON 解析 + 决策归一
        └─ HookRunResult：每个 hook 独立产生一条 HookContextMessage
                 │
                 ├─ FlowList：hook 步骤（含 failed / blocked 审计）
                 ├─ agent.state.messages → 非空 text 映射为 <hook_context> user 消息
                 └─ 调用点效果合并：阻断工具 / 单次审批 / 拒绝提交
```

- V1 仅支持 `command` handler；配置来源仅用户级 `~/.lx/config.json` 的 `agent.hooks`，无项目级、无热重载；亦可在 设置 → 钩子 中可视化增删改（保存后仅对新会话生效，运行中会话沿用旧配置）。
- 所有执行失败（spawn 失败 / 超时 / 非零退出 / 伪 JSON）一律 **fail-open**；阻断只能来自成功执行且显式声明的信号。
- hook 运行产物为 `HookContextMessage`（role `hookContext`）：非空 `text` 注入模型上下文，同时驱动执行流展示；不进入消息列表（MsgList）分组。

## 2. 事件矩阵

| 事件 | 触发挂点 | 效果 |
|------|----------|------|
| `SessionStart` | `sessionRunner.runOne`（每会话一次） | `additionalContext` 注入本轮首发前 |
| `UserPromptSubmit` | `sessionRunner.runOne`（每次提交） | `additionalContext` 注入用户消息前；`continue:false` 拒绝提交 |
| `PreToolUse` | `agent-loop.prepareToolCall`（权限解析后） | `exit 2 + stderr` 或 `decision:block` → 工具不执行，原因作为错误结果回灌 |
| `PermissionRequest` | `permissionManager.gate`（系统结论为 `ask`、弹 UI 前） | `allow` / `deny` 单次生效并替代 UI；失败/无决策回落 UI |
| `PostToolUse` | `agent-loop` 工具执行收尾 | `additionalContext` 紧跟工具结果注入 |
| `PreCompact` | `contextCompactor` 摘要生成前 | 永不阻断；输出仅审计展示 |
| `PostCompact` | 压缩成功后 | 永不阻断；输出仅审计展示 |
| `SubagentStart` | `task` 工具子代理启动 | `additionalContext` 仅注入子代理自身上下文 |
| `SubagentStop` | 子代理结束（成功/失败/中止） | 状态审计（`done` / `error` / `aborted`） |
| `Stop` | agent 正常停止前（`agent-loop`） | 通知与审计；不引入阻止停止语义 |
| `SessionEnd` | `agentRunner.deleteSession` / `app.will-quit` | best-effort（3s 超时），不等待异步工作 |

## 3. 配置 schema（`~/.lx/config.json` → `agent.hooks`）

```jsonc
{
  "agent": {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "bash|edit|write",
          "hooks": [
            {
              "name": "block-rm-rf",
              "type": "command",
              "command": "~/.lx/hooks/block-rm.sh",
              "commandWindows": "powershell -File C:\\hooks\\block-rm.ps1",
              "timeout": 30,
              "additionalContextLimit": 2500
            }
          ]
        }
      ]
    }
  }
}
```

- 事件键为 PascalCase 精确名；未知键告警并忽略。
- `matcher`：`"a|b|c"` 竖线分隔的精确工具名（非正则），缺省 = 全部；仅 `PreToolUse` / `PostToolUse` / `PermissionRequest` 使用。
- `command` 必填（`type` 缺省即 `command`）；`commandWindows` 在 win32 优先。
- `timeout` 秒，默认 600，下限 1；`additionalContextLimit` token，默认 2500，`0` 禁用 spill。
- 非法条目（结构错误 / 未知 handler 类型 / 空命令）→ 警告 + 忽略该条，不阻断会话启动。

## 4. 线协议（对齐 Codex / Claude 生态）

stdin（snake_case，JSON 写入后关闭）：

```jsonc
{
  "session_id": "…",
  "turn_id": "…",
  "cwd": "/abs/path",
  "hook_event_name": "PreToolUse",
  "model": "…",
  "permission_mode": "default",
  "tool_name": "bash",
  "tool_input": { "command": "…" },
  "tool_use_id": "call_…"
}
```

stdout（camelCase 严格 JSON，允许为空）：

```jsonc
{
  "continue": true,
  "stopReason": "…",
  "suppressOutput": false,
  "systemMessage": "…",
  "decision": "block",
  "reason": "…",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "…",
    "decision": { "behavior": "allow", "message": "…" }
  }
}
```

子进程环境注入 `LX_SESSION_ID` / `LX_HOOK_EVENT` / `LX_HOOK_NAME` / `LX_CWD`。

## 5. 安全边界

1. 仅用户级配置，信任级别等于用户自己开终端；不引入项目级 hooks（避免 clone 即执行供应链风险）。
2. 执行隔离：一次性子进程 + 超时杀进程树 + stdout/stderr 1MB 硬顶。
3. `PermissionRequest` 失败绝不升级为放行；Guardian `deny` / deny 规则 / 沙箱只读不可被 hook 覆盖。
4. hook 无永久规则写入能力，每次决定均产生审计消息。

## 6. 代码与测试

- 契约：`src/shared/contracts/agent.ts`（`HookEventName` / `HookRunStatus` / `HookContextMessage`）
- 引擎：`src/main/agent/hooks/`（`hookConfig` / `commandRunner` / `outputParser` / `dispatcher` / `hooksManager`）
- 设置读写：`settingsService`（`getHookSettings` / `saveHookSettings`，保存后只清 `global` 缓存）+ IPC `settings:hooks:get/save`；编辑器：`src/renderer/src/features/settings/components/HooksSettings.tsx`
- 单测：`test/main/agent/hooks/`（配置校验 / parser 全分支 / runner / dispatcher / 压缩 fail-open）、`test/main/services/hookSettingsService.test.ts`（归一 / 写盘 / 拒绝 / 缓存失效）
- 调用点集成：`test/main/agent/hooks/sessionHooks.integration.test.ts` 与 `test/main/agent/agentRunner.test.ts`
- 渲染呈现：`test/renderer/features/agent/hookContextPresentation.test.ts` 与 `test/renderer/features/settings/HooksSettings.test.tsx`
