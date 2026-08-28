# 权限、沙箱与安全体系

本文档定义 LX Agent 的多层安全防御体系：协作模式（Default/Plan）、三档沙箱策略（Sandbox Policy）、Guardian 四维风险评估器、多级审批流（Approval Policy）与规则引擎。

架构总览见 [architecture.md](./architecture.md)；工具契约见 [tools.md](./tools.md)；运行时执行见 [runtime.md](./runtime.md)。

---

## 1. 安全防御总览

```text
                     Agent Tool Call
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 1: Collaboration Mode]                                │
│   - Plan Mode: 遇到任何写操作/修改工具 ──► 硬拦截 (拒绝执行) │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 2: Sandbox Policy]                                    │
│   - ReadOnly 沙箱: 遇到任何非只读操作  ──► 硬拦截 (拒绝执行) │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 3: Guardian & Safety Guards]                          │
│   - CommandSafetyGuard: 语法树解析拦截 rm -rf / git reset 等 │
│   - Guardian: 四维风险评估 (Exfiltration/Probing/Destruction) │
│     -> High/Critical 风险强制绕过白名单，升级人工审批        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 4: Rules & Whitelist Engine]                          │
│   - Deny Rules: 命中直接拒绝 (最高优先级)                    │
│   - Session Whitelist: 会话级工具/前缀/路径放行             │
│   - Allow Rules: 命中放行                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ [Gate 5: Approval Policy Engine]                            │
│   - never / on_request / unless_trusted                     │
│   - 触发 PermissionRequest 弹窗 -> 用户决策 (Once/Session/Deny)│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 协作模式与沙箱策略

### 2.1 协作模式 (Collaboration Mode)
- **`default` (执行模式)**：常规全功能模式，支持读写文件、执行命令与协作。
- **`plan` (规划模式)**：
  - 严格 **Non-Mutating** 只读环境。
  - 允许工具：`read`、`ls`、`grep`、`find`、`time`、`memory`（只读 action）、`lsp`、`question`、`web_search`、`switch_mode` 等。
  - 拦截工具：`write`、`edit`、`apply_patch`、`bash`、以及具破坏性的 MCP 工具。若模型尝试调用，系统直接硬拦截并返回说明引导其在规划完成后调用 `switch_mode` 切回 Default 模式。

### 2.2 三档沙箱策略 (Sandbox Policy)
- **`read-only`**：全局硬性只读沙箱，禁止任何文件修改与可能带来副作用的命令执行。
- **`workspace-write` (默认推荐)**：限制文件读写与命令执行在当前工作区 (`cwd`) 范围内，敏感操作受审批策略约束。
- **`danger-full-access`**：全局完全访问权限，适用于高级用户在完全受信环境下执行复杂系统级任务。

---

## 3. Guardian 四维风险防护网 (`guardianEvaluator.ts`)

借鉴工业级安全标准，Guardian 在底层对所有即将执行的操作进行实时的四维风险评估：

| 风险维度 | 监测目标与特征 | 拦截与升级行为 |
| :--- | :--- | :--- |
| **Data Exfiltration (数据外发)** | 尝试向外部未授权域名上传代码、敏感文件、Token、密钥文件内容 | 评估为 `High`/`Critical`，Plan 模式直接阻断，Default 模式强制升级审批 |
| **Credential Probing (凭据刺探)** | 探测 `.ssh/`、`.aws/`、Keychain、系统密码文件或浏览器 Cookie 数据库 | 评估为 `Critical`，直接拦截并记录安全告警 |
| **Persistent Security Weakening (持久化降权)** | 尝试修改 `/etc/hosts`、`sudoers`、禁用防火墙/SIP 或执行全盘 `chmod 777` | 强制拦截，禁止自动放行 |
| **Destructive Actions (破坏性操作)** | 执行广义递归删除（`rm -rf /`、`rm -rf ~`）、`git reset --hard`、`git push --force` | 强制拦截并要求人工二次显式确认 |

---

## 4. 多级审批策略 (Approval Policy) 与会话白名单

### 4.1 审批策略级别
- **`never`**：除 Guardian 高危与 Deny 规则外，尽量不打扰用户，自动放行符合沙箱的操作。
- **`unless_trusted` (默认推荐)**：受信任工作区内的常规只读和安全操作自动放行，未受信任命令或写操作弹出审批。
- **`on_request`**：所有具备副作用的工具调用均需用户逐次手动审批。

### 4.2 审批决策流 (Approval Decisions)
当触发 `permission_request` 事件时，用户可在 UI 弹窗中选择：
1. **`approve_once` (单次放行)**：仅批准当前这单次工具调用。
2. **`approve_session` (会话级放行)**：在本会话生命周期内将该工具或路径加入内存白名单，后续不再询问。
3. **`approve_prefix` (前缀放行)**：对 Bash 命令（如 `git status`、`npm test`）按命令前缀加入会话白名单。
4. **`deny` (拒绝执行)**：拒绝本次调用，将用户填写的拒绝原因封装为错误结果回灌给模型。

---

## 5. 规则配置 Schema (`~/.lx/config.json`)

```jsonc
{
  "agent": {
    "permissions": {
      "defaultMode": "default",
      "approvalPolicy": "unless_trusted",
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

- **优先级铁律**：`Guardian 硬阻断 > Deny 规则 > Session 白名单 > Ask 规则 > Allow 规则 > ApprovalPolicy 默认判定`。
- **原子持久化**：用户勾选「永久允许/永久拒绝」时，通过原子重命名安全写入配置文件，并实时热重载生效。
