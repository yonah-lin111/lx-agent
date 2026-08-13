# 数据库迁移规范

本文定义 LX Agent 主进程 SQLite 数据库的迁移机制与变更流程。

## 原则

- 数据库 schema 变更只通过迁移文件落地，`CREATE TABLE` / `ALTER TABLE` 一律写在 `src/main/db/migrations/`。
- 已应用的迁移不可修改、不可回删；任何 schema 变更必须新增一个迁移文件，按版本升序追加。
- 迁移是"只进不退"的向前演化，禁止修改旧迁移以伪造历史。

## 目录与命名

```text
src/main/db/
  connection.ts        连接与初始化（只负责开库 + 跑迁移）
  migrate.ts           迁移运行器
  migrations/          全部迁移文件，独立于 schema 与连接
    types.ts           Migration 接口
    index.ts           迁移注册表（按版本升序）
    NNNN_<名称>.ts      单个迁移
```

- 文件名：`0001_init.ts`、`0002_drop_project_item_sort_order.ts`，数字前缀必须全局递增，名称用英文 kebab-case 概括变更。
- 注册表 `index.ts` 按版本升序导出 `migrations: Migration[]`，新增迁移必须同步登记。

## Migration 接口

每个迁移文件导出唯一的 `migration` 对象：

```ts
import type { Migration } from "./types"

export const migration: Migration = {
  version: 2,
  name: "drop_project_item_sort_order",
  up: (database) => {
    database.exec("ALTER TABLE project_item DROP COLUMN sort_order")
  },
}
```

- `version` 必须与文件名数字前缀一致且全局唯一。
- `up` 接收 better-sqlite3 连接，执行本迁移的全部 DDL / 数据变更。
- 迁移内不需要 `IF NOT EXISTS` 等幂等写法——运行器保证每个迁移只执行一次。

## 追踪表与运行器

- 追踪表 `_migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TIMESTAMP)` 记录已应用迁移。
- 启动时 `initDatabase` 调用 `runMigrations`：
  1. 创建 `_migrations`（若不存在）。
  2. 探测旧库：迁移系统启用前已存在 `project_item` 表且追踪表为空时，把初始快照迁移登记为已应用（基线），只补跑其后迁移。
  3. 按版本升序执行每个未应用迁移，每个迁移在独立事务内执行并登记版本。
- 全新库从 0001 顺序执行到最新；旧库只执行基线与最新之间的新增迁移。

## 基线说明

迁移系统引入时，历史 schema 被烘焙为第一个迁移（当前为 `0001_init`，含全部建表）。旧库已具备这些表结构，运行器自动把 0001 登记为已应用，不会重跑。此逻辑由 `LEGACY_PROBE_TABLE`（`project_item`）探测，无需人工干预。

## 变更流程

新增一个 schema 变更：

1. 在 `src/main/db/migrations/` 新建 `NNNN_<名称>.ts`，导出 `migration`。
2. 在 `migrations/index.ts` 按版本顺序登记。
3. 若变更影响既有数据，在 `up` 内处理（如 `PRAGMA table_info` 探测后补数据或删列）。
4. 在 `test/main/db/index.test.ts` 补充或更新迁移相关断言。

## 测试要求

- 迁移运行器测试必须覆盖：全新库全量应用、旧库基线补跑、重复执行幂等。
- 修改迁移后同步更新表结构、约束、级联相关测试。
- 完成后执行 Biome 格式化与匹配范围类型检查、测试。
