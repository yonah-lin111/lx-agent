# 权限、沙箱与安全体系

本文档定义 LX Agent 的多层安全防御体系：四态协作模式硬门禁、三档沙箱策略（Sandbox Policy）、Guardian 四维风险评估器、多级审批流与会话白名单规则引擎。

架构总览见 [architecture.md](./architecture.md)；工具契约见 [tools.md](./tools.md)；模式输出协议见 [collaboration-modes.md](./collaboration-modes.md)；执行引擎见 [runtime.md](./runtime.md)。

---

## 1. 安全防御总览

```text
                     Agent Tool Call
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 1: Collaboration Mode]                                │
│   - Plan / Review 模式: write/edit/apply_patch/todowrite    │
│     ──► 硬拦截 (拒绝执行，返回模式专用错误文案)              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 2: Sandbox Policy]                                    │
│   - read-only 沙箱: write/edit/apply_patch ──► 硬拦截        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 3: Safety Guards & Guardian]                          │
│   - CommandSafetyGuard: dangerous 级命令直接 deny            │
│   - Guardian 四维风险: high/critical → Plan/Review deny，    │
│     Build 强制升级为 ask（即使 bypassPermissions）           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 4: Rules & Session Whitelist]                         │
│   - Deny Rules: 命中直接拒绝                                │
│   - Session Whitelist: 会话级工具/前缀/路径/全放行          │
│   - Allow / Ask Rules 匹配                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 5: Approval]                                          │
│   - bypassPermissions / danger-full-access → 放行           │
│   - acceptEdits → 文件修改类放行                            │
│   - 默认触发 PermissionRequest 弹窗 → 用户决策              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 协作模式硬门禁（Gate 1）

`src/shared/contracts/agent.ts` 定义四态协作模式（历史值 `"default"` 由 `normalizeCollaborationMode` 归一化为 `"build"`）：

```typescript
export type CollaborationMode = "build" | "plan" | "review" | "design"
```

| 模式 | 写入工具（`write`/`edit`/`apply_patch`） | `todowrite` | 其他工具 | 输出契约 |
| :--- | :--- | :--- | :--- | :--- |
| **`build`** | 按沙箱/规则/审批正常判定 | 允许 | 正常判定 | 无 |
| **`plan`** | **deny**（Plan Mode 提示词引导输出 `<proposed_plan>`） | **deny** | 只读工具正常 | 见 collaboration-modes.md |
| **`review`** | **deny**（提示词引导输出 `<review_findings>`） | **deny** | 只读工具正常 | 见 collaboration-modes.md |
| **`design`** | 按沙箱/规则/审批正常判定（无模式级硬拦截） | 允许 | 正常判定 | `<front_design>` / `<front_design_update>`，见 front-design.md |

- Plan / Review 的 deny 为**硬拦截**：不进入审批弹窗，直接返回带模式说明的 error ToolResult 回灌模型（`PLAN_MODE_MUTATION_REASON` / `REVIEW_MODE_MUTATION_REASON`）。
- `design` 模式仅约束输出协议（提示词层），不做工具级拦截；`render_svg` / `render_ascii` / `render_html` 已从工具集整体移除（见 tools.md §2）。
- 模式切换：`Shift + Tab` 在 `build → plan → review → design → build` 间循环（状态栏按钮等价），或经 IPC `setCollaborationMode` 定向切换；卡片一键采纳也会切回 `build`。

---

## 3. 三档沙箱策略（Gate 2）

| 策略 | 行为 |
| :--- | :--- |
| **`read-only`** | 硬拦截文件写入类工具（`write` / `edit` / `apply_patch`）；`bash` 不自动豁免，仍受命令安全检测、Guardian、规则与审批逐层判定 |
| **`workspace-write`（默认）** | 文件读写与命令执行按规则/审批受控，审批面板与规则引擎按路径上下文判定 |
| **`danger-full-access`** | 跳过会话白名单与 Allow/Ask 规则判定直接放行；**不能**绕过 Deny 规则、CommandSafetyGuard dangerous 拦截与 Guardian（见 §5 判定顺序） |

---

## 4. Guardian 四维风险防护网 (`guardianEvaluator.ts`)

Guardian 在工具执行前进行实时四维风险评估：

| 风险维度 | 监测目标与特征 | 拦截与升级行为 |
| :--- | :--- | :--- |
| **Data Exfiltration（数据外发）** | 向外部未授权域名上传代码、敏感文件、Token、密钥文件内容 | `High`/`Critical`：Plan/Review 直接拦截；Build 强制升级审批 |
| **Credential Probing（凭据刺探）** | 探测 `.ssh/`、`.aws/`、Keychain、系统密码文件或浏览器 Cookie 数据库 | `Critical`：直接拦截并记录安全告警 |
| **Persistent Security Weakening（持久化降权）** | 修改 `/etc/hosts`、`sudoers`、禁用防火墙/SIP 或全盘 `chmod 777` | 强制拦截，禁止自动放行 |
| **Destructive Actions（破坏性操作）** | 广义递归删除（`rm -rf /`、`rm -rf ~`）、`git reset --hard`、`git push --force` | `High`/`Critical`：Plan/Review 拦截；Build 强制人工二次确认 |

被 Guardian 判定为 `high` / `critical` 的操作，即使处于 `bypassPermissions` 或 `danger-full-access`，在 Build 模式也强制升级为 `ask`。

---

## 5. 规则引擎与会话白名单（Gate 4）

### 5.1 判定顺序（`permissionManager.evaluate()`）

1. Plan / Review 模式写入工具与 `todowrite` → `deny`；
2. `read-only` 沙箱的 `write` / `edit` / `apply_patch` → `deny`；
3. `CommandSafetyGuard` 判定 `dangerous` 的 bash 命令 → `deny`；
4. **Deny 规则**命中 → `deny`（最高优先级的配置规则）；
5. **Guardian** `high`/`critical`：Plan/Review → `deny`，其余模式 → `ask`；
6. **会话白名单**：`allowAll` → 工具级放行 → Bash 前缀放行 → 文件路径放行；
7. 全局放行通道：`bypassPermissions` 或 `danger-full-access` → `allow`；`EXEMPT_TOOLS` → `allow`；非受控内置工具与非 MCP 工具 → `allow`；
8. `CommandSafetyGuard` 判定 `sensitive` 的 bash 命令 → `ask`；
9. **Ask 规则**优先于 **Allow 规则**匹配；
10. `acceptEdits` 模式的 `write` / `edit` / `apply_patch` → `allow`；
11. 兜底 → `ask`。

### 5.2 工具分级

- **豁免工具（`EXEMPT_TOOLS`，永不询问）**：`web_search` / `read` / `ls` / `grep` / `find` / `time` / `read_skill` / `question` / `lsp` / `view_image`。
- **受控内置工具（`GATED_BUILTIN_TOOLS`）**：`bash` / `write` / `edit` / `apply_patch` / `task` / `webfetch`；加上全部已连接 MCP 工具均进入审批判定。

### 5.3 审批决策流 (Approval Decisions)

触发 `permission_request` 事件时，用户在 UI 中的可选决策：

1. **`approve_once`（单次放行）**：仅批准当前这次工具调用。
2. **`approve_session`（会话级放行）**：当前会话内存白名单放行该工具；Bash 可附 `prefix` 做命令前缀放行；随会话切换重置。路径白名单判定（`isPathAllowedInSession`）已接入 `evaluate()`，但当前交互不写入路径级白名单。
3. **`allowAll`（会话全放行）**：跳过后续规则与弹窗，仅限当前会话。
4. **`deny`（拒绝执行）**：拒绝本次调用，返回 `USER_DENY_REASON` 回灌模型；拒绝原因可附在结果中。
5. **`permanent`（永久规则）**：勾选后经 `persistRule()` 将 `Tool(arg)` 形态规则原子写入配置文件（永久 allow 或永久 deny），实时热重载生效。

### 5.4 权限确认模式 (`PermissionMode`)

| 模式 | 行为 |
| :--- | :--- |
| **`default`** | 按 §5.1 完整判定，受控工具默认进入审批 |
| **`acceptEdits`** | 文件修改类工具自动放行，其余仍走审批 |
| **`bypassPermissions`** | 跳过白名单/规则/审批，但 Deny 规则、dangerous 命令与 Guardian 仍生效 |

---

## 6. 规则配置 Schema (`~/.lx/config.json`)

```jsonc
{
  "agent": {
    "permissions": {
      "defaultMode": "default",
      "sandboxPolicy": "workspace-write",
      "collaborationMode": "build",
      "allow": [
        "Bash(git status)",
        "Edit(src/**)",
        "Write(test/**)",
        "codegraph_codegraph_search()"
      ],
      "deny": [
        "Bash(rm -rf *)",
        "Bash(git reset --hard*)",
        "Edit(.env)"
      ],
      "ask": [
        "Bash(docker *)"
      ]
    }
  }
}
```

- **规则形态**：`Tool(arg)`，支持 `Bash(git status*)` 前缀匹配、`Edit(src/**)` 路径 glob、MCP 全名（`server_tool`）与无参工具 `Tool()`；`rule.ts` 负责解析与匹配，非法规则忽略并告警。
- **优先级铁律**（与 §5.1 一致）：`模式硬门禁 > read-only 沙箱 > dangerous 命令 > Deny 规则 > Guardian > 会话白名单 > 全局放行 > sensitive 命令 > Ask 规则 > Allow 规则 > acceptEdits > 默认审批`。
- **原子持久化**：永久允许/拒绝经 `settingsService.savePermissionSettings` 安全写入 `~/.lx/config.json` 并热重载。
