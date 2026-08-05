# Skill 接入

本文定义 LX Agent 的 Skill 接入形态：格式规范、加载、注入、触发。接入逻辑参考 [pi](https://github.com/earendil-works/pi) 的 `packages/coding-agent/src/core/skills.ts` 与 `agent-session.ts`（`/skill:` 展开）；**skill 的编写格式对齐 pi**。

## 1. 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | 来源 | **user 级 `~/.lx/skills` + 项目级 `<cwd>/.lx/skills`** 双来源；同名冲突 **user 优先** |
| 2 | 注入方式 | systemPrompt 只放 skill 的 **name + description**（XML 块）；正文由专用 **`read_skill(name)`** 工具按需读取 |
| 3 | `read_skill` 边界 | 只收 skill **name**（加载器查表解析路径），**不收路径参数**——天然豁免 cwd 限制，无需碰 `resolveToCwd` |
| 4 | 触发 | **模型自主**（命中描述调 `read_skill`）+ **显式 `/skill:<name> args`**（main 侧展开正文）；`disable-model-invocation` 的 skill 仅显式可用 |
| 5 | 注入上限 | 单次注入最多 **50** 个 skill（按 name 排序取前 50）；单条 description 截断 1024 字符 |
| 6 | 激活绑定 | 存在 ≥1 个可用 skill 时，`read_skill` **强制进激活集**（prompt 承诺了它就必须在） |
| 7 | 会话快照 | 恢复历史会话时 skill **按当前配置重载**；快照 `skills[]` 仅展示/校验 |

## 2. Skill 编写格式（对齐 pi）

```
~/.lx/skills/
  my-skill/
    SKILL.md        # skill 根：目录含 SKILL.md 即 skill，不再递归
    assets/...      # 可选：正文引用的相对资源
```

`SKILL.md` 头：

```markdown
---
name: my-skill          # 可选：缺省用目录名；校验：小写 a-z0-9 连字符、≤64、首尾非连字符、无连续连字符
description: 一句话说明用途（必填，≤1024），用于模型判断何时触发
disable-model-invocation: false   # 可选：true = 禁止模型自主触发，仅 /skill:<name> 显式调用
---

正文……（模型按需读入的完整指令；正文内相对路径以 skill 目录为基准）
```

约束（与 pi 一致）：

- **目录含 `SKILL.md` 即 skill 根，不再递归**；目录无 `SKILL.md` 时加载根目录直接 `.md` 子文件并继续递归子目录。
- `description` 缺失/为空 → 该 skill **不加载**（警告）；name/description 违规仅记警告仍加载。
- 跳过 `.` 开头条目与 `node_modules`；遵循 `.gitignore`/`.ignore`/`.fdignore`。
- 来源语义：user（`~/.lx/skills`）/ project（`<cwd>/.lx/skills`）；冲突 user 优先，被覆盖方记诊断。

## 3. 加载器

新增 `src/main/agent/skills/skillLoader.ts`：进程内单例，按会话 cwd 缓存 `{ userSkills, projectSkills }`。

```ts
interface LoadedSkill {
  name: string
  description: string
  filePath: string
  baseDir: string
  disableModelInvocation: boolean
}

interface SkillLoader {
  load(cwd: string): LoadedSkill[]     // user + project 合并，user 优先，冲突去重
  get(name: string, cwd: string): LoadedSkill | undefined
  getSkillDir(): string                // ~/.lx/skills（文档用）
}
```

## 4. 注入（systemPrompt 拼接）

skill 的 name+description 块拼在 `DEFAULT_SYSTEM_PROMPT` 之后，**Agent 创建时一次性拼好**（非每轮 `transformContext`）。对齐 pi `formatSkillsForPrompt`：

```
\n\nThe following skills provide specialized instructions for specific tasks.
Use the read_skill tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>my-skill</name>
    <description>…</description>
    <location>…/SKILL.md</location>
  </skill>
</available_skills>
```

规则：

- `disableModelInvocation=true` 的 skill **不进 prompt**（仅显式可用）。
- 数量上限 50（按 name 排序取前 50）；description 截断 1024。
- **只要加载到 ≥1 个可用 skill，`read_skill` 就注册并进激活集**（与 `agent.pages.skills` 允许列表正交）。

## 5. `read_skill` 工具

新增 `src/main/agent/skills/readSkillTool.ts`：

| 字段 | 值 |
|------|----|
| `name` | `read_skill` |
| `inputSchema` | `{ name: z.string() }`（**仅 skill name，不接受路径**） |
| `description` | 读取指定 skill 的完整指令正文；任务匹配 `available_skills` 中某项时调用 |
| `execute` | 查 `skillLoader.get(name)`；未命中 → 返回错误 toolResult（列可用名）；命中 → 返回 strip frontmatter 后的正文，注明 `baseDir`（相对路径基准），经 `truncate.ts` 截断（复用 `DEFAULT_MAX_LINES`/`DEFAULT_MAX_BYTES`） |

工具本体不含任何路径参数，路径解析完全走加载器白名单——不触碰 `resolveToCwd`，无需豁免。

## 6. 显式触发（/skill:）

`agentRunner.send(text)` 入口处理（对齐 pi `_expandSkillCommand`）：

```ts
// 输入 "/skill:name args"
// → 命中 skill：正文块（strip frontmatter）插入用户消息，
//   args 非空时追加在块后
// → 未命中：原样透传（由模型自行解释）
```

- 展开在 **main 侧**（skill 文件读取在 main）；renderer 只透传原文。
- 展开块携带 name/location/baseDir 上下文（对齐 pi `<skill name location>` 语义）。
- `/skill:` 显式调用对 `disable-model-invocation` 的 skill 同样生效。
- 后续 `/` 命令面板（UI 补全/展示）只碰 renderer，复用此展开逻辑，不改 main。

## 7. 与现有代码的接线

| 位点 | 改动 |
|------|------|
| `agentRunner` | `ensureReady()`：cwd 确定后 `skillLoader.load(cwd)` → 拼 systemPrompt XML 块；注册 `read_skill` 工具；`send()` 入口 `_expandSkillCommand` |
| `agentRunner.prepareBinding()` | 计算注入清单：item 会话取全部可用 skill（`disable-model-invocation` 除外），页面会话按 `getPageCapabilities(route).skills[]` 允许列表过滤；排序后截断至 50 |
| `agentRunner.beginSessionTurn()` | `active_capabilities` 快照 `skills[]` 记实际注入清单（仅展示/校验） |

## 8. 演进留口（v2+）

- **注入上限放宽/分页**：当前 50 上限硬编码；后续可加设置项。
- **skill 附带工具集**：pi 的 skill 可携带可选工具；v1 仅正文指令，`tools` 关联留口（对齐 `extensions.md` 原 §5 预留）。
- **命令面板**：`/skill:` 展开逻辑已就位，UI 补全为独立任务。

## 9. 验收

- `~/.lx/skills/<name>/SKILL.md` 出现后，`available_skills` 注入 systemPrompt；`read_skill` 进激活集。
- 模型调 `read_skill(<name>)` 能读到正文；未知 name 返回明确错误。
- 输入 `/skill:<name> args` 展开为正文块；`disable-model-invocation` 的 skill 仅显式可用。
- user/project 同名 skill：user 生效，project 记诊断。
- 超 50 个 skill：按 name 排序注入前 50，其余不进 prompt 但 `/skill:` 仍可显式调用。
