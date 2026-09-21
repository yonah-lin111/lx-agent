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
    "Configure capabilities for each collaboration mode (Build / Plan / Review / Design); configuration can only narrow the hard baseline, never widen it.",
  collaborationModePermissionsDoc: `### Collaboration Mode Permissions

Configure independent capability allowlists for the four collaboration modes (Build / Plan / Review / Design).

- **Non-Build hard baseline**: \`write\` / \`edit\` / \`apply_patch\` / \`todowrite\` / \`task\` / \`memory\` are permanently disabled and cannot be re-enabled by configuration.
- **Design Mode**: additionally disables \`wireframe\` (deliver prototypes via the \`<front_design>\` protocol).
- **Semantics**: an unrestricted group is bounded only by the hard baseline; a restricted group keeps only the checked items (none checked = group fully disabled).
- **Effective**: applies from the next turn; hard-baseline tools are stripped from saved allowlists automatically.`,
  collaborationModePermissionsEdit: "Edit permissions",
  collaborationModePermissionsLockedHint: "Permanently disabled: {{tools}}",

  // Custom Commands section
  customCommandAgentInputTab: "Chat Commands (AgentInput)",
  customCommandAgentMDTab: "Markdown Template Commands (AgentMD)",
  customCommandGlobalScope: "Global",
  customCommandProjectScope: "Project",
  customCommandSelectProject: "Select an imported project",
  customCommandsList: "Commands List",
  addCustomCommand: "New Command",
  customCommandsEmpty: "No custom commands in the current scope",
  customCommandsEmptyTip: "Click 'New Command' to create your customized slash commands",
  customCommandsLoadFailed: "Failed to load custom commands",
  newCustomCommandDraft: "New Command",
  confirmDeleteCustomCommand: "Are you sure you want to delete command /{{name}}?",
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
  customCommandContentPlaceholder: "Enter Markdown template or Prompt content here...",
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

  customCommandAgentMDHelpTitle: "Markdown Template Commands Guide",
  customCommandAgentMDHelpDesc:
    "Type / in the Markdown editor to open the slash menu and insert rich text or template blocks directly.",
  customCommandMDScopeTitle: "Scope Details",
  customCommandMDGlobalScopeDesc:
    "Can be invoked both in normal text and inside &&& template blocks",
  customCommandMDTemplateScopeDesc:
    "Only available inside &&& template blocks (e.g. nested sub-templates)",
}
