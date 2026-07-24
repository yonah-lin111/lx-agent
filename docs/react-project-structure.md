# LX Agent 项目结构规范

本文档面向在 LX Agent 中编写代码的 Agent。新增或修改代码时，必须遵守本文的目录归属、依赖方向和拆分规则。

## 目标

保持 Electron 三进程边界清晰，渲染进程采用 feature-first 结构。优先最小修改，不为未来假设创建空目录、空文件或抽象层。

## 总体目录

```text
src/
  main/                         Electron 主进程
    index.ts                    应用生命周期、窗口创建、启动编排
    db/
      connection.ts             数据库连接与初始化
      schema/                   当前表结构定义
      migrations/               独立数据迁移脚本，仅在迁移时创建
      index.ts                  db 公共导出
    ipc/                        IPC handler 注册
    services/                   领域服务、持久化规则、业务校验
    agent/                      只能在主进程运行的 Agent 能力
    protocols/                  自定义协议
    lib/                        仅主进程复用的工具
  preload/
    index.ts                    组装 contextBridge 暴露对象
    api/                        按领域拆分的 preload API，规模增长后创建
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
docs/                           面向开发者与 Agent 的规范
```

`src/shared` 只能放无副作用的类型、常量和纯函数。禁止导入 React、Electron、数据库驱动或 Node 专属运行时代码。

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
      api/                      调用 preload API、HTTP 或其他基础设施
      components/               仅属于该 feature 的组件
      hooks/                    feature 查询、状态和 mutation
      types.ts                  feature 唯一领域类型来源
      utils.ts                  无副作用的领域函数
      constants.ts              feature 私有常量
      index.ts                  feature 唯一对外入口
  pages/
    <page-name>/                页面形成独立领域后再目录化
      index.tsx                 页面入口
      components/               仅页面使用的组合组件
      hooks/                    仅页面使用的视图状态
  routes/                       路由声明、守卫和重定向
  lib/                          跨 feature 的纯工具和常量
```

## 文件归属决策

按以下顺序决定新代码位置：

1. 跨进程复用的 DTO、输入类型或 IPC channel：放 `src/shared/`。
2. Electron 业务规则、文件系统、数据库操作：放 `src/main/services/`。
3. 将 IPC 暴露给 renderer 的薄转发：放 `src/preload/`。
4. 一个独立业务能力及其数据、操作、组件：放 `renderer/src/features/<feature-name>/`。
5. 仅用于一个路由页面的布局组合：放 `renderer/src/pages/<page-name>/`。
6. 与业务无关且可跨 feature 复用的视觉组件：放 `renderer/src/components/ui/`。
7. 应用壳、侧栏、内容区等跨页面框架：放 `renderer/src/components/layout/`。
8. 不属于以上任何一项的纯工具：放对应进程的 `lib/`；先确认它确实跨领域复用。

禁止以“可能会复用”为理由创建 `shared`、`lib` 或 `components/ui` 文件。

## 依赖方向

必须遵守以下方向：

```text
pages -> features -> components/ui, lib, shared
components/layout -> features, components/ui
renderer feature api -> preload api -> shared ipc -> main ipc -> main services -> db
main services -> db, shared
```

禁止事项：

- `components/ui` 不得导入 feature、page、route 或 `window.api`。
- Hook 不得从 feature 组件导入领域类型；类型只从 feature 的 `types.ts` 或 `shared` 导入。
- renderer 不得直接导入 Electron、数据库或 `main` 模块。
- `preload` 不得包含业务规则或数据库逻辑。
- `main/ipc` 不得实现业务规则，只负责 handler 注册、参数边界和 service 调用。
- 不得在 main、preload、renderer 三处重复硬编码 IPC channel 或 DTO。
- 不得跨 feature 深层导入实现文件；优先从 feature 的 `index.ts` 导入公开能力。

## Feature 标准结构

当功能包含数据读取或写入时，采用以下结构：

```text
features/<feature-name>/
  api/<feature>Api.ts           renderer 到 preload 的适配层
  components/                   feature 视图
  hooks/use<Feature>Data.ts     读取、刷新、缓存状态
  hooks/use<Feature>Mutations.ts 写入、错误反馈、刷新
  types.ts                      feature 类型
  utils.ts                      可单独测试的纯函数
  index.ts                      公开组件、Hook 或类型
```

规则：

- `api/` 是该 feature 中唯一可访问 `window.api` 的位置。
- 组件只负责渲染、事件绑定和短生命周期视图状态。
- Hook 负责异步操作、刷新、错误处理和 toast 等反馈。
- 若读取与写入没有共享状态，分别使用 `useXxxData` 和 `useXxxMutations`。
- 只有一个简单操作时，可保留单个 `useXxx`，不要为命名机械拆分。

## 页面目录化规则

页面仅有占位内容时保留单文件，例如 `pages/HomePage.tsx`。

出现以下任一情况时，改为 `pages/<page-name>/` 目录：

- 页面有两个以上专属组件。
- 页面有 URL 参数、页面级筛选或页面级布局状态。
- 页面组合两个以上 feature。
- 页面文件开始混合路由、状态、数据请求和复杂布局。

页面负责组合 feature，不复制 feature 内的 API、Hook 或领域逻辑。

## Electron 与 IPC 规则

- IPC channel 定义在 `src/shared/ipc/`，main 和 preload 必须复用同一常量。
- preload 只暴露最小白名单 API，参数和返回值使用 `shared/contracts` 类型。
- 每个 IPC 领域应有 main handler、preload API 和 renderer feature API 三层。
- 需要校验外部输入时，在 main service 或 handler 边界使用 Zod 等运行时校验；TypeScript 类型不等于运行时校验。
- 数据库 schema 变更必须新增独立迁移文件，不能修改既有迁移以伪造历史。

## 拆分阈值

- `.tsx` 或 `.ts` 超过 1200 行：必须按职责拆分。
- 文件虽未超过 1200 行，但同时包含视图、领域操作和基础设施调用：优先按边界拆分。
- 一个 service 处理两个无关聚合：拆分 service。
- 一个 feature API 同时代理多个独立实体且无法共享错误处理或刷新逻辑：按实体拆分 API 文件。
- 不因文件不足 1200 行而拒绝必要拆分，也不因“看起来整齐”而过度拆分。

## 测试要求

- `utils.ts`：测试输入输出和边界值。
- feature Hook：mock feature API，覆盖成功、失败、刷新失败和关键状态转换。
- preload：测试公开对象与共享 channel 的参数转发。
- main IPC：测试所有共享 channel 都注册了 handler。
- main service：测试业务规则、数据库约束和级联行为。
- 组件：只覆盖用户可见行为，例如键盘操作、表单提交、条件渲染。

新增 IPC channel 时，必须同时更新 shared 常量、preload、main handler 和三层契约测试。

## Agent 执行清单

在编写代码前检查：

1. 新代码属于哪个进程和哪个业务领域？
2. 是否已有 feature、API、类型或组件可复用？
3. 是否违反依赖方向或引入跨层导入？
4. 是否需要新增或调整测试？
5. 是否需要更新 IPC 契约或数据迁移？

完成代码后必须：

1. 使用 Biome 格式化受影响的代码文件。
2. 执行与改动范围匹配的类型检查和测试。
3. 检查没有遗留旧导入、重复 DTO、重复 channel 或未使用目录。
