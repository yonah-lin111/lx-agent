export const permissions = {
  sandboxPolicy: "执行沙箱策略 (Sandbox Policy)",
  sandboxPolicyDesc: "限制 Agent 在文件系统与终端环境中的执行边界。",
  sandboxPolicyDoc: `### 执行沙箱策略 (Sandbox Policy)

定义 Agent 的**物理与环境操作红线**，决定工具是否具备写入或访问外部资源的物理能力。

- **\`workspace-write\` (工作区读写 - 推荐)**: 仅允许读写当前工作区项目目录下的文件。向工作区外写文件将被物理拦截。
- **\`read-only\` (只读沙箱)**: 严禁任何 \`write\` / \`edit\` 文件修改，物理阻断副作用操作。
- **\`danger-full-access\` (完全访问)**: 允许访问与修改操作系统任意目录（破坏性系统指令仍受底层安全 Guard 保护）。

---

#### 💡 组合生效逻辑
- **Sandbox 决定能力红线**：若沙箱为 \`read-only\`，即便权限模式设为 \`bypassPermissions\`，写文件仍会被**直接硬拦截**（不弹窗）。
- **Permission 决定交互模式**：在沙箱允许的操作范围内，再由权限模式决定是否停下来询问人工确认。`,
  sandboxReadOnly: "read-only — 只读沙箱",
  sandboxWorkspaceWrite: "workspace-write — 工作区读写（默认）",
  sandboxDangerFullAccess: "danger-full-access — 完全访问（无沙箱限制）",
  sandboxReadOnlyDesc: "严禁任何 write/edit 文件修改与破坏性终端操作。",
  sandboxWorkspaceWriteDesc: "允许读写当前工作区文件，外部路径写操作需显式确认。",
  sandboxDangerFullAccessDesc: "完全放开系统与文件操作限制（破坏性系统指令仍受底层安全拦截保护）。",
  permissionMode: "权限模式 (Permission Mode)",
  permissionModeDesc: "决定未命中规则时门控工具的默认处理方式。",
  permissionModeDoc: `### 权限模式 (Permission Mode)

控制 Agent 执行操作时与人类的**交互与确认行为**。

- **\`default\` (逐次询问 - 推荐)**: 未命中白名单规则时，终端命令 (\`bash\`) 与 MCP 工具调用均需人工弹窗确认。
- **\`acceptEdits\` (自动放行编辑)**: 自动信任并放行所有代码与文件修改 (\`write\`, \`edit\`, \`apply_patch\`)，终端命令仍会询问确认。
- **\`bypassPermissions\` (全部放行)**: 所有门控工具直接放行执行，不再弹窗询问（极度高危凭据嗅探等仍受 Guardian 强制安全防线保护）。

---

#### 💡 核心判定流程
1. **Plan 协作模式 / Read-Only 沙箱**：修改操作直接硬阻断。
2. **Guardian 四维安全网**：高危凭据嗅探与外发强制升级为人工审批。
3. **会话白名单 / 规则组**：命中会话临时授权或 Allow 规则直接放行。
4. **Permission Mode**：无匹配时依据当前模式执行自动放行或弹窗询问。`,
  modeDefault: "default — 按规则逐次询问",
  modeAcceptEdits: "acceptEdits — write/edit 自动允许",
  modeBypass: "bypassPermissions — 全部放行",
  modeDefaultDesc: "未命中规则时，bash / MCP 工具逐次询问确认。",
  modeAcceptEditsDesc: "write / edit 自动允许（仍受 deny 约束），bash / MCP 工具逐次询问确认。",
  modeBypassDesc: "所有门控工具直接执行，不再询问确认。",
  bypassWarning: "bypassPermissions 下门控工具（bash / write / edit / MCP）不再询问确认。",
  defaultCollaborationMode: "默认协作模式 (Default Collaboration Mode)",
  defaultCollaborationModeDesc: "新建会话启动时使用的协作模式；已有会话不受影响。",
  defaultCollaborationModeDoc: `### 默认协作模式

新建会话（新标签页 / 应用重启后）启动时使用的协作模式，可在状态栏点击模式标签或使用 Shift + Tab 临时切换。

- **Build / Plan / Review / Design**：与状态栏协作模式一致。
- **Minimal**：仅终端工具（\`bash\`）的极简模式，适合测试与对比模型基础表现。
- **生效时机**：仅对新建会话生效；当前会话的临时切换不会被覆盖。`,
  ruleGroups: "规则组",
  allowRules: "允许规则 (Allow)",
  allowRulesDesc: "无需确认直接放行执行",
  denyRules: "拒绝规则 (Deny)",
  denyRulesDesc: "直接拒绝执行",
  askRules: "询问规则 (Ask)",
  askRulesDesc: "每次执行均需人工确认",
  addRule: "添加规则",
  addRuleFor: "添加{{label}}规则",
  deleteRule: "删除规则 {{rule}}",
  noRules: "暂无规则",
  rulePlaceholder: "ToolName(arg)，如 Bash(git status)",
  ruleInvalidFormat: "格式应为 ToolName(arg)，如 Bash(git status)",
  ruleSyntaxHint:
    "语法：ToolName(arg)。bash 为命令前缀匹配；write/edit 为路径 glob；MCP 工具为参数子串匹配。",

  // Collaboration Mode Permissions
  collaborationModePermissions: "协作模式权限 (Collaboration Mode Permissions)",
  collaborationModePermissionsDesc:
    "为 Build / Plan / Review / Design / Minimal 五种协作模式分别配置可用能力；配置只能收紧，无法放开硬基线。",
  collaborationModePermissionsDoc: `### 协作模式权限

为五种协作模式（Build / Plan / Review / Design / Minimal）独立配置能力白名单。

- **非 Build 模式硬基线**：\`write\` / \`edit\` / \`apply_patch\` / \`todowrite\` / \`memory\` 永久禁用，权限配置无法放开。
- **Minimal 模式白名单**：仅允许终端工具 \`bash\`（后台作业参数与其余全部工具永久禁用），不可编辑。
- **子代理派发**：\`task\` 由 \`subagents\` 组控制；非 Build 模式缺省仅允许内置探索子代理 \`explorer\`，可另行勾选其他或自定义角色；子代理的工具调用同样继承父模式硬基线。
- **Design 模式**：在上述基线之外额外禁用 \`wireframe\`（原型交付走 \`<front_design>\` 协议）。
- **配置语义**：每组关闭 = 不限制（仅受硬基线约束）；打开后勾选白名单，一项都不勾 = 该组全禁。
- **生效时机**：下一轮对话生效；硬基线工具在保存时自动从白名单中剥离。`,
  collaborationModePermissionsEdit: "编辑权限",
  collaborationModePermissionsLockedHint: "永久禁用：{{tools}}",
  collaborationModePermissionsAllowedOnlyHint: "仅允许：{{tools}}",
  collaborationModePermissionsLockedRolesHint:
    "永久禁用角色：{{roles}}（能力集含本模式硬基线工具，编辑确认后自动移除）",

  // Custom Commands section
  customCommandViewChat: "对话命令",
  customCommandViewMd: "md命令",
  customCommandViewBlocks: "md模板块",
  customCommandGlobalScope: "全局 (Global)",
  customCommandProjectScope: "项目 (Project)",
  customCommandSelectProject: "选择已导入项目",
  customCommandsList: "命令列表",
  addCustomCommand: "新建命令",
  customCommandsEmpty: "当前作用域下暂无自定义命令",
  customCommandsEmptyTip: "点击「新建命令」创建属于您的专属指令",
  customCommandsLoadFailed: "加载自定义命令失败",
  newCustomCommandDraft: "新命令",
  customCommandMenu: "{{name}} 操作菜单",
  customCommandDelete: "删除命令",
  customCommandConfirmDelete: "确认删除",
  createCustomCommandTitle: "创建自定义命令",
  editCustomCommandTitle: "编辑命令 /{{name}}",
  customCommandName: "命令名称",
  customCommandDescription: "命令描述",
  customCommandDescriptionPlaceholder: "简要说明该命令的作用",
  customCommandArgumentHint: "参数提示 (argument-hint)",
  customCommandArgumentHintHelp: "在命令菜单中显示的参数占位提示，例如 [feature] [branch]",
  customCommandMDScope: "插入作用域 (scope)",
  customCommandScopeGlobal: "全局可用 (文档正文及模板块内)",
  customCommandScopeTemplateOnly: "仅模板块内 (&&& 内)",
  customCommandContent: "命令模板内容",
  customCommandMetaExpand: "编辑信息",
  customCommandMetaCollapse: "收起信息",
  customCommandInsertBlock: "插入模板块",
  customCommandBlockTemplateName: "任务块",
  customCommandBlockSuppleName: "临时块",
  customCommandBlockLogName: "记录块",
  customCommandBlockGroupBuiltin: "内置骨架",
  customCommandBlockGroupCustom: "我的模板块",
  customCommandBlockType: "块类型",
  customCommandBlockTitle: "块标题 (title)",
  customCommandBlockTitlePlaceholder: "例如：需求说明",
  customCommandBlockTitleHelp:
    "渲染时显示在块头（块名旁），用于在文档中识别块的用途；不参与解析逻辑。",
  customCommandBlockContent: "块内容",
  customBlocksList: "模板块列表",
  customBlocksEmpty: "当前作用域下暂无模板块",
  customBlocksEmptyTip: "点击「新建模板块」创建可在编辑器中插入的模板块",
  addCustomBlock: "新建模板块",
  createCustomBlockTitle: "创建模板块",
  editCustomBlockTitle: "编辑模板块 /{{name}}",
  customBlocksDoc: [
    "### 任务块 `&&&`",
    "全局可用。块以 `--start` / `--end` 标记首尾，开始行可携带 `「title: 标题」`；结束行插入时自动补全 `{id:...}`（编辑器内只读），支持状态循环（todo / in_progress / done）与 `{wt:分支}` 工作区绑定。",
    "",
    "### 临时块 `+++`",
    "仅可嵌套在任务块内部，名称任意；复制父模板时整块剔除，不沉淀到模板。",
    "",
    "### 记录块 `%%%`",
    "仅可嵌套在任务块内部，名称任意；复制父模板时保留内容。",
    "",
    "### 示例",
    "```text",
    "&&& reviewTemplate --start 「title: 需求评审」",
    "- 需求:",
    "  - ",
    "+++ addonTemplate --start 「title: 补充需求」",
    "- 补充:",
    "  - ",
    "+++ addonTemplate --end",
    "%%% execLog --start 「title: 执行记录」",
    "- 结论:",
    "%%% execLog --end",
    "&&& reviewTemplate --end",
    "```",
  ].join("\n"),
  customCommandNameRequired: "命令名称不能为空",
  customCommandProjectPathRequired: "项目级命令必须选择有效项目",
  customCommandSaveSuccess: "自定义命令保存成功",
  customCommandSaveFailed: "保存自定义命令失败",
  customCommandDeleteSuccess: "自定义命令已删除",
  customCommandDeleteFailed: "删除自定义命令失败",

  customCommandAgentInputHelpTitle: "Agent 对话命令使用说明",
  customCommandAgentInputHelpDesc:
    "保存在本地的 Prompt 模板，在对话框输入 / 命令名称 即可快速唤起并展开为完整提示词。",
  customCommandMacroTitle: "宏变量与占位符",
  customCommandMacroPositional: "第 N 个位置参数（空格分隔）",
  customCommandMacroAll: "传入的所有参数整串",
  customCommandMacroDefault: "带默认值的参数",
  customCommandMacroSlice: "从第 N 个参数开始的所有后续参数",

  customCommandAgentMDHelpTitle: "md 命令使用说明",
  customCommandAgentMDHelpDesc:
    "在 Markdown 文档编辑器中输入 / 即可呼出命令菜单，直接在光标处插入富文本或模板块。",
  customCommandMDScopeTitle: "作用域说明",
  customCommandMDGlobalScopeDesc: "在文档正文和 &&& 任务块内均可唤起并插入",
  customCommandMDTemplateScopeDesc: "仅在 &&& 任务块内部可用（如补充需求等子块）",
  customCommandMDBlocksTitle: "支持的模板块",
  customCommandMDTemplateBlockDesc: "任务块（&&&），全局可用；插入时自动补全唯一 id",
  customCommandMDSuppleBlockDesc: "临时块（+++），仅限任务块内部；复制父模板时整块剔除",
  customCommandMDLogBlockDesc: "记录块（%%%），仅限任务块内部；复制父模板时保留内容",
}
