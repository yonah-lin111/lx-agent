# 项目目录结构

本文定义 LX Agent 的 Electron 三进程目录、renderer 分层和依赖方向。

## 总体目录

```text
src/
  main/
    index.ts                    应用生命周期、窗口创建、启动编排
    db/
      connection.ts             数据库连接与初始化
      schema/                   当前表结构定义
      migrations/               独立迁移文件，仅在迁移时创建
      index.ts                  db 公共导出
    ipc/                        IPC handler 注册
    services/                   领域服务、持久化规则和业务校验
    agent/                      仅主进程可运行的 Agent 能力
    protocols/                  自定义协议
    lib/                        仅主进程复用的工具
  preload/
    index.ts                    组装 contextBridge 暴露对象
    api/                        按领域拆分的 preload API
  renderer/
    index.html
    src/                        React 应用
  shared/
    contracts/                  跨进程 DTO、输入类型、API 接口
    ipc/                        跨进程 IPC channel 常量
test/
  main/                         主进程、数据库、IPC 测试
  preload/                      preload API 契约测试
  renderer/                     feature、Hook、组件测试
  shared/                       shared 契约测试
docs/                           开发规范
```

`src/shared` 只能放无副作用的类型、常量和纯函数，禁止导入 React、Electron、数据库驱动或 Node 专属运行时代码。

## Renderer 目录

```text
src/renderer/src/
  App.tsx                       应用壳，只组合全局布局和 Provider
  main.tsx                      React 启动入口
  styles.css                    全局样式和 Tailwind 覆盖
  components/
    ui/                         无业务语义的基础组件
    layout/                     应用框架和跨页面布局
  features/
    <feature-name>/
      api/                      访问 preload API、HTTP 等基础设施
      components/               仅属于该 feature 的组件
      hooks/                    feature 查询、状态和 mutation
      types.ts                  feature 唯一领域类型来源
      utils.ts                  无副作用的领域函数
      constants.ts              feature 私有常量
      index.ts                  feature 唯一对外入口
  pages/
    <page-name>/
      index.tsx                 页面入口
      components/               仅页面使用的组合组件
      hooks/                    仅页面使用的视图状态
  routes/                       路由声明、守卫和重定向
  lib/                          跨 feature 的纯工具和常量
```

## 文件归属

1. 跨进程 DTO、输入类型或 IPC channel：`src/shared/`。
2. Electron 业务规则、文件系统、数据库操作：`src/main/services/`。
3. IPC 的薄转发：`src/preload/`。
4. 独立业务能力及其数据、操作、组件：`renderer/src/features/<feature-name>/`。
5. 仅用于一个路由页面的布局组合：`renderer/src/pages/<page-name>/`。
6. 无业务语义且跨 feature 复用的视觉组件：`renderer/src/components/ui/`。
7. 跨页面框架：`renderer/src/components/layout/`。
8. 跨领域纯工具：对应进程的 `lib/`。

禁止因“可能复用”创建空的 `shared`、`lib` 或 `components/ui` 文件。

## 依赖方向

```text
pages -> features -> components/ui, lib, shared
components/layout -> features, components/ui
renderer feature api -> preload api -> shared ipc -> main ipc -> main services -> db
main services -> db, shared
```

- `components/ui` 不得导入 feature、page、route 或 `window.api`。
- Hook 不得从 feature 组件导入领域类型；类型只从 feature `types.ts` 或 `shared` 导入。
- renderer 不得直接导入 Electron、数据库或 `main` 模块。
- preload 不得包含业务规则或数据库逻辑。
- main IPC 不得实现业务规则，只负责 handler 注册、参数边界和 service 调用。
- 不得跨 feature 深层导入实现文件；优先从 feature `index.ts` 导入公开能力。

## Feature 与页面拆分

数据读写 feature 的默认结构：

```text
features/<feature-name>/
  api/<feature>Api.ts
  components/
  hooks/use<Feature>Data.ts
  hooks/use<Feature>Mutations.ts
  types.ts
  utils.ts
  index.ts
```

`api/` 是 feature 中唯一可访问 `window.api` 的位置。组件负责渲染与短生命周期视图状态；Hook 负责异步操作、刷新、错误处理和反馈。

页面仅有占位内容时保留单文件。出现两个以上专属组件、URL 参数、页面级状态，或组合两个以上 feature 时，改为 `pages/<page-name>/` 目录。
