# 代码编写规范

本文定义 LX Agent 的 TypeScript、IPC、数据库迁移、测试和验证规则。

## TypeScript 与注释

- 函数统一使用箭头函数。
- 业务判断、枚举值、状态值和默认数据名称使用英文稳定值；中文仅用于展示文案。
- 可被类实现、声明合并或对外扩展的对象形状使用 `interface`；联合、交叉、工具、函数和元组类型使用 `type`。
- 变量、`type`、`interface`、`enum` 使用简体中文单行注释说明。
- 函数和方法使用简体中文注释说明，注释需要十分简洁。
- 代码、标签属性与逻辑字符串使用英文；禁止写入 Unicode 替换字符 `U+FFFD`。
- 项目模块使用对应进程源码根目录的 `@/` 绝对路径别名；shared 使用 `@shared/`。禁止 `../` 等相对导入。

## IPC 与数据库

- IPC channel 定义在 `src/shared/ipc/`，main 和 preload 必须复用同一常量。
- preload 只暴露最小白名单 API，参数和返回值使用 shared 契约类型。
- 每个 IPC 领域应有 main handler、preload API 和 renderer feature API 三层。
- 需要校验外部输入时，在 main handler 或 service 边界使用运行时校验；TypeScript 类型不等于运行时校验。
- 数据库 schema 变更必须新增独立迁移文件，不能修改既有迁移以伪造历史。
- 数据迁移必须是独立 TypeScript 文件，禁止混入 schema、建表初始化或数据库连接文件。
- 禁止在 main、preload、renderer 三处重复硬编码 IPC channel 或 DTO。

## 拆分规则

- `.tsx` 或 `.ts` 超过 1200 行时必须按职责拆分。
- 组件超过 1200 行时转换为目录：`index.tsx` 为对外入口，主视图放 `<ComponentName>.tsx`，细分视图放 `components/`，逻辑放 `hooks/`，类型、常量、工具分别放 `types.ts`、`constants.ts`、`utils.ts`。
- 逻辑或 Hook 超过 1200 行时，拆为职责单一的子 Hook 或模块，不能仅压缩代码排版。
- 未超过阈值但同时包含视图、领域操作和基础设施调用时，也应按边界拆分。
- service 处理两个无关聚合时拆分；feature API 无法共享错误处理或刷新逻辑时按实体拆分。
- 不因文件不足 1200 行而拒绝必要拆分，也不为“整齐”进行过度拆分。

## 测试与验证

- `utils.ts`：测试输入输出和边界值。
- feature Hook：mock feature API，覆盖成功、失败、刷新失败和关键状态转换。
- preload：测试公开对象与共享 channel 的参数转发。
- main IPC：测试所有共享 channel 都注册 handler。
- main service：测试业务规则、数据库约束和级联行为。
- 组件：只覆盖键盘操作、表单提交、条件渲染等用户可见行为。
- 新增 IPC channel 时，必须同步更新 shared 常量、preload、main handler 和三层契约测试。
- 修改完成后必须使用 Biome 格式化受影响代码文件，并执行匹配范围的类型检查和测试。
