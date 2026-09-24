export const permissions = {
  sandboxPolicy: "Sandbox Policy",
  sandboxPolicyDesc: "Restricts execution boundaries in filesystem and terminal environments.",
  sandboxPolicyDoc: `### Sandbox Policy

Defines the **physical boundaries and safety restrictions** for the Agent's environment.

- **\`workspace-write\` (Workspace Read & Write - Recommended)**: Only allows modifying files inside the current workspace. External writes are blocked.
- **\`read-only\` (Read Only Sandbox)**: Strictly prevents all \`write\` / \`edit\` modifications, enforcing read-only operation.
- **\`danger-full-access\` (Full Access)**: Unrestricted access across the system (destructive commands remain protected by system Guard).

---

#### 💡 Combination Logic
- **Sandbox enforces hard capabilities**: In \`read-only\` mode, even if permission mode is \`bypassPermissions\`, mutations are **immediately blocked** without prompting.
- **Permission controls interactive flow**: Within sandbox boundaries, Permission Mode dictates whether human confirmation is requested.`,
  sandboxReadOnly: "read-only — Read Only Sandbox",
  sandboxWorkspaceWrite: "workspace-write — Workspace Read & Write (Default)",
  sandboxDangerFullAccess: "danger-full-access — Full Access (No Sandbox)",
  sandboxReadOnlyDesc: "Strictly blocks all write/edit operations and destructive commands.",
  sandboxWorkspaceWriteDesc:
    "Allows modifications inside current workspace; external writes require confirmation.",
  sandboxDangerFullAccessDesc:
    "Unrestricted execution (destructive system commands still protected by safety guard).",
  permissionMode: "Permission Mode",
  permissionModeDesc: "Determines how gated tools are handled when no rule is matched.",
  permissionModeDoc: `### Permission Mode

Controls the **interactive approval behavior** between Agent and human user.

- **\`default\` (Ask per rule - Recommended)**: Non-exempt tools like \`bash\` or MCP require interactive confirmation when no rule matches.
- **\`acceptEdits\` (Auto-allow write/edit)**: Automatically grants file edits (\`write\`, \`edit\`, \`apply_patch\`), while \`bash\` commands still prompt.
- **\`bypassPermissions\` (Allow all)**: Runs all tools directly without prompts (high-risk credential access remains protected by Guardian).

---

#### 💡 Evaluation Pipeline
1. **Plan Collaboration Mode / Read-Only Sandbox**: Block mutations immediately.
2. **Guardian Safety Guard**: High-risk credential probing escalates to approval.
3. **Session Whitelist / Rules**: Matched whitelist items execute directly.
4. **Permission Mode**: Evaluates default fallback behavior.`,
  modeDefault: "default — Ask per rule",
  modeAcceptEdits: "acceptEdits — Auto-allow write/edit",
  modeBypass: "bypassPermissions — Allow all",
  modeDefaultDesc: "When no rule matches, ask confirmation for bash / MCP tools.",
  modeAcceptEditsDesc:
    "write / edit are automatically allowed (still subject to deny rules); bash / MCP tools require confirmation.",
  modeBypassDesc: "All gated tools execute directly without asking confirmation.",
  bypassWarning:
    "Under bypassPermissions, gated tools (bash / write / edit / MCP) will not ask for confirmation.",
  defaultCollaborationMode: "Default Collaboration Mode",
  defaultCollaborationModeDesc:
    "Collaboration mode used when a new session starts; existing sessions are unaffected.",
  defaultCollaborationModeDoc: `### Default Collaboration Mode

The collaboration mode used when a new session starts (new tab / after app restart). Switch temporarily from the status bar mode tag or with Shift + Tab.

- **Build / Plan / Review / Design**: same as the status bar collaboration modes.
- **Minimal**: terminal + file read/write mode (\`bash\` / \`read\` / \`write\` / \`edit\`), useful for testing and comparing basic model performance.
- **Effective**: applies to new sessions only; temporary switches in current sessions are not overwritten.`,
  ruleGroups: "Rule Groups",
  allowRules: "Allow Rules",
  allowRulesDesc: "Always execute without confirmation",
  denyRules: "Deny Rules",
  denyRulesDesc: "Always reject execution",
  askRules: "Ask Rules",
  askRulesDesc: "Always ask confirmation",
  addRule: "Add Rule",
  addRuleFor: "Add {{label}} Rule",
  deleteRule: "Delete Rule {{rule}}",
  noRules: "No rules configured",
  rulePlaceholder: "ToolName(arg), e.g. Bash(git status)",
  ruleInvalidFormat: "Format should be ToolName(arg), e.g. Bash(git status)",
  ruleSyntaxHint:
    "Syntax: ToolName(arg). Bash uses prefix match; write/edit uses path glob; MCP tools use parameter substring match.",

  // Collaboration Mode Permissions
  collaborationModePermissions: "Collaboration Mode Permissions",
  collaborationModePermissionsDesc:
    "Configure capabilities for each collaboration mode (Build / Plan / Review / Design / Minimal); configuration can only narrow the hard baseline, never widen it.",
  collaborationModePermissionsDoc: `### Collaboration Mode Permissions

Configure independent capability allowlists for the five collaboration modes (Build / Plan / Review / Design / Minimal).

- **Non-Build hard baseline**: \`write\` / \`edit\` / \`apply_patch\` / \`todowrite\` / \`memory\` are permanently disabled and cannot be re-enabled by configuration.
- **Minimal Mode allowlist**: only \`bash\` / \`read\` / \`write\` / \`edit\` are allowed (background job flags and every other tool are permanently disabled); not editable.
- **Sub-agent dispatch**: \`task\` is controlled by the \`subagents\` group. Non-Build modes default to the built-in explorer sub-agent only; other or custom roles can be checked in. Sub-agent tool calls also inherit the parent mode's hard baseline.
- **Design Mode**: additionally disables \`wireframe\` (deliver prototypes via the \`<front_design>\` protocol).
- **Semantics**: an unrestricted group is bounded only by the hard baseline; a restricted group keeps only the checked items (none checked = group fully disabled).
- **Effective**: applies from the next turn; hard-baseline tools are stripped from saved allowlists automatically.`,
  collaborationModePermissionsEdit: "Edit permissions",
  collaborationModePermissionsLockedHint: "Permanently disabled: {{tools}}",
  collaborationModePermissionsAllowedOnlyHint: "Allowed only: {{tools}}",
  collaborationModePermissionsLockedRolesHint:
    "Permanently disabled roles: {{roles}} (capability set includes blocked tools; removed once you confirm an edit)",

  // Custom Commands section
  customCommandViewChat: "Chat Commands",
  customCommandViewMd: "MD Commands",
  customCommandViewBlocks: "MD Blocks",
  customCommandGlobalScope: "Global",
  customCommandProjectScope: "Project",
  customCommandSelectProject: "Select an imported project",
  customCommandsList: "Commands List",
  addCustomCommand: "New Command",
  customCommandsEmpty: "No custom commands in the current scope",
  customCommandsEmptyTip: "Click 'New Command' to create your customized slash commands",
  customCommandsLoadFailed: "Failed to load custom commands",
  newCustomCommandDraft: "New Command",
  customCommandMenu: "{{name}} Actions",
  customCommandDelete: "Delete Command",
  customCommandConfirmDelete: "Confirm Delete",
  createCustomCommandTitle: "Create Custom Command",
  editCustomCommandTitle: "Edit Command /{{name}}",
  customCommandName: "Command Name",
  customCommandDescription: "Description",
  customCommandDescriptionPlaceholder: "Brief description of what this command does",
  customCommandArgumentHint: "Argument Hint (argument-hint)",
  customCommandArgumentHintHelp:
    "Placeholder hint displayed in the command menu, e.g. [feature] [branch]",
  customCommandMDScope: "Insertion Scope (scope)",
  customCommandScopeGlobal: "Global (Document body & inside template blocks)",
  customCommandScopeTemplateOnly: "Template Only (inside &&& blocks)",
  customCommandContent: "Template Content",
  customCommandMetaExpand: "Edit Details",
  customCommandMetaCollapse: "Collapse Details",
  customCommandInsertBlock: "Insert Block",
  customCommandBlockTemplateName: "Task Block",
  customCommandBlockSuppleName: "Temporary Block",
  customCommandBlockLogName: "Record Block",
  customCommandBlockGroupBuiltin: "Built-in",
  customCommandBlockGroupCustom: "My Blocks",
  customCommandBlockType: "Block Type",
  customCommandBlockTitle: "Block Title (title)",
  customCommandBlockTitlePlaceholder: "e.g. Requirement Notes",
  customCommandBlockTitleHelp:
    "Shown next to the block name in rendered output, to identify the block's purpose in the document. Not used for parsing.",
  customCommandBlockContent: "Block Content",
  customBlocksList: "Blocks",
  customBlocksEmpty: "No blocks in the current scope",
  customBlocksEmptyTip: "Click 'New Block' to create a reusable block insertable from the editor",
  addCustomBlock: "New Block",
  createCustomBlockTitle: "Create Block",
  editCustomBlockTitle: "Edit Block /{{name}}",
  customBlocksDoc: [
    "### Task Block `&&&`",
    "Available globally. Blocks are delimited by `--start` / `--end`; the start line may carry `「title: ...」`; a unique `{id:...}` is injected into the end line on insert (read-only in the editor); the end line supports status cycling (todo / in_progress / done) and `{wt:branch}` worktree binding.",
    "",
    "### Temporary Block `+++`",
    "Can only be nested inside a Task Block; any name; removed entirely when copying the parent template.",
    "",
    "### Record Block `%%%`",
    "Can only be nested inside a Task Block; any name; content kept when copying the parent template.",
    "",
    "### Example",
    "```text",
    "&&& reviewTemplate --start 「title: Review」",
    "- Requirements:",
    "  - ",
    "+++ addonTemplate --start 「title: Addendum」",
    "- Addendum:",
    "  - ",
    "+++ addonTemplate --end",
    "%%% execLog --start 「title: Execution Log」",
    "- Conclusion:",
    "%%% execLog --end",
    "&&& reviewTemplate --end",
    "```",
  ].join("\n"),
  customCommandNameRequired: "Command name is required",
  customCommandProjectPathRequired: "Project-scoped commands require selecting a valid project",
  customCommandSaveSuccess: "Custom command saved successfully",
  customCommandSaveFailed: "Failed to save custom command",
  customCommandDeleteSuccess: "Custom command deleted successfully",
  customCommandDeleteFailed: "Failed to delete custom command",

  customCommandAgentInputHelpTitle: "Agent Input Commands Guide",
  customCommandAgentInputHelpDesc:
    "Locally saved Prompt templates that can be triggered by typing /command in the chat box.",
  customCommandMacroTitle: "Macros & Placeholders",
  customCommandMacroPositional: "N-th positional argument (space separated)",
  customCommandMacroAll: "All passed arguments as a single string",
  customCommandMacroDefault: "Argument with fallback default value",
  customCommandMacroSlice: "All arguments starting from index N",

  customCommandAgentMDHelpTitle: "MD Commands Guide",
  customCommandAgentMDHelpDesc:
    "Type / in the Markdown editor to open the slash menu and insert rich text or template blocks directly.",
  customCommandMDScopeTitle: "Scope Details",
  customCommandMDGlobalScopeDesc: "Can be invoked both in normal text and inside &&& task blocks",
  customCommandMDTemplateScopeDesc:
    "Only available inside &&& task blocks (e.g. nested sub-blocks)",
  customCommandMDBlocksTitle: "Supported Blocks",
  customCommandMDTemplateBlockDesc:
    "Task block (&&&), available globally; a unique id is injected on insert",
  customCommandMDSuppleBlockDesc:
    "Temporary block (+++), inside Task Block only; removed when copying the parent template",
  customCommandMDLogBlockDesc:
    "Record block (%%%), inside Task Block only; content kept when copying the parent template",
}
