# 项目级开发规范

编写或评审代码前，必须阅读并遵守：

- `docs/standards/frontend-design-requirements.md`
- `docs/standards/project-directory-structure.md`
- `docs/standards/code-writing-standards.md`

## Agent 执行规则

- 保持 Electron 三进程边界清晰，renderer 采用 feature-first 结构。
- 优先最小修改，不为未来假设创建空目录、空文件或抽象层。
- 新增、移动或拆分代码前，确认代码所属进程、业务领域、依赖方向及已有可复用能力。
- 完成修改后，检查没有遗留旧导入、重复 DTO、重复 channel 或无用目录，并执行匹配范围的验证。
- 禁止使用 HTML 标签原生的 `title` 属性显示提示，统一使用项目 Tooltip 组件。
- 你目前在 Electron 框架中，无法使用浏览器进行 **页面** 调试，只能要求用户自行启动项目测试。
- 代码修改完成后，不需要运行项目验证，让用户自行测试。
- 以上文档是项目规范的唯一来源；若与上级指令冲突，以上级指令为准。
