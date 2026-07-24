# 项目级开发规范

编写或评审代码前，必须阅读并遵守：

- `docs/frontend-design-requirements.md`
- `docs/project-directory-structure.md`
- `docs/code-writing-standards.md`

## Agent 执行规则

- 保持 Electron 三进程边界清晰，renderer 采用 feature-first 结构。
- 优先最小修改，不为未来假设创建空目录、空文件或抽象层。
- 新增、移动或拆分代码前，确认代码所属进程、业务领域、依赖方向及已有可复用能力。
- 完成修改后，检查没有遗留旧导入、重复 DTO、重复 channel 或无用目录，并执行匹配范围的验证。
- 以上文档是项目规范的唯一来源；若与上级指令冲突，以上级指令为准。
