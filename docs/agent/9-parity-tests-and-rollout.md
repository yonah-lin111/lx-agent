# 9. Parity 测试与发布顺序

## 9.1 目标

把 pi 的行为测试转为 LX 的 contract tests、main integration tests、preload IPC tests 和 renderer behavior tests。文档完成不等于实现完成；每个能力都必须有证据或明确的当前不实施标记。

## 9.2 测试层次

### shared

- DTO schema、enum、error code、JSON round-trip；
- event reducer 的 duplicate/gap/sequence 行为；
- IPC channel 常量和版本兼容。

### main unit

- Agent Loop 的纯文本、thinking、tool call、parallel tool、continue、abort；
- Queue mode、operation lock、snapshot isolation；
- ModelRuntime adapter 的 stream/error/usage/retry 映射；
- ToolRegistry、fake ExecutionEnvironment、truncate、timeout、edit conflict；
- ResourceLoader、skill/template parser、trust、extension lifecycle；
- Compaction preparation、summary、overflow retry。

### main integration

- SQLite migration、append transaction、leaf、branch、fork、navigate、resume、JSONL import/export；
- Runtime Registry 多 session 并发、dispose、事件序号、窗口关闭；
- main IPC handler 的参数拒绝、错误映射和事件推送。

### preload

- 公开 API 的 method/channel/参数转发；
- event listener/unsubscribe、窗口销毁清理；
- contextBridge 不暴露 ipcRenderer、Node 或内部对象。

### renderer

- `useAgentSession` snapshot + event reducer；
- prompt、abort、new/resume/fork、compact、tree navigation；
- tool card、thinking、error、queue、phase 和 reconnect UI；
- 键盘提交/停止、可访问名称、布局稳定，不测试具体实现细节。

## 9.3 从 pi 迁移的行为矩阵

逐项参考：

- `packages/agent/test/agent-loop.test.ts`
- `packages/agent/test/agent.test.ts`
- `packages/agent/test/harness/agent-harness.test.ts`
- `packages/agent/test/harness/session.test.ts`
- `packages/agent/test/harness/storage.test.ts` 和 sqlite tests
- `packages/agent/test/harness/compaction.test.ts`
- `packages/agent/test/harness/tools.test.ts`
- `packages/coding-agent` 的 session runtime、compaction、extension tests

迁移测试时只复制输入、事件顺序、状态和错误语义，不复制 pi 的 import path、TUI snapshot 或内部类名。

## 9.4 阶段发布门槛

1. 阶段 1：shared/main/preload 契约测试通过，任何 renderer 不得直接调用 main。
2. 阶段 2：fake provider + fake tools 跑通完整 loop 和 abort。
3. 阶段 3：read/write/edit/bash 在 main integration 中通过，shell 输出/超时/取消可复现。
4. 阶段 4：SQLite 重启、fork、navigate、JSONL 导入导出通过；旧 Mock 不再是真源。
5. 阶段 5：多 session 并发、runtime dispose、snapshot reconnect 通过。
6. 阶段 6：AgentPage 只消费 IPC，真实 stream 可见，现有右侧栏新建/历史行为不回归。
7. 阶段 7：trust、extension register/reload/shutdown、resource reload 通过。
8. 阶段 8：compaction、overflow retry、branch summary、telemetry redaction 通过。
9. 阶段 9：能力矩阵逐项签字，未实现项在 UI/文档中可查，才允许移除 feature flag。

## 9.5 数据迁移与回滚

- 新 migration 只新增 Agent 表和索引，不改项目表历史。
- 首次启动可把当前内存 Mock 标记为不可迁移；不把随机 Mock 回复写入真实会话。
- 迁移失败阻止启用真实 Agent，但项目和设置功能仍可启动。
- feature flag 只切换 renderer 入口和 runtime 创建，不双写两套 session 真源。
- 回滚代码时保留新增 Agent 表；旧版本忽略未知表和配置，不删除用户会话。

## 9.6 完成检查清单

- [ ] `AgentPage.tsx` 不含 Mock timer、window.clearInterval 或 session persistence。
- [ ] 所有 agent channel 同时存在 shared、preload、main 和测试。
- [ ] main 运行时没有未经 schema 校验的 renderer input。
- [ ] SQLite transaction 覆盖 entry + leaf + materialized state。
- [ ] Runtime Registry 以 sessionId 隔离 abort、cwd、model、events。
- [ ] 工具、Provider、扩展、资源均可替换且无 renderer Node 依赖。
- [ ] compaction/retry/branch summary 行为有测试；durable v2 明确标记未实施。
- [ ] 默认 telemetry 脱敏，扩展清理和应用退出路径可验证。
- [ ] pi CLI/RPC/TUI 宿主能力明确列为不适用，不再被误报为缺陷。

## 9.7 当前不实施总表

| 能力 | 状态 | 备注 |
| --- | --- | --- |
| durable effects/generator | 未实现，本轮不做 | 仅保留仓储、sequence、recoverability 扩展位 |
| run/step/task crash resume | 未实现，本轮不做 | 重启只恢复已提交 session context |
| 多 ref/lane/跨设备复制 | 未实现，本轮不做 | Runtime 仍按 sessionId 单 owner |
| Gondolin/Docker/OpenShell | 未实现，本轮不做 | ExecutionEnvironment 可插拔 |
| npm/git 扩展包管理 | 未实现，本轮不做 | 先支持本地 JS/TS extension |
| TUI/CLI/print/json/RPC/server | 不适用 | Electron IPC 是唯一宿主入口 |
