/**
 * 指令安全守卫 (Command Safety Guard)
 *
 * 核心机制：
 * 1. 递归拆解 shell 封装层 (如 sudo, env, sh -c, bash -c 等)，最深支持 8 层；
 * 2. rm 的受保护目标 (/, ~, $HOME, .., cwd, 通配清空) 结构化判定，其余绝对破坏性指令 (git reset --hard, git clean -fdx, mkfs 等) 模式匹配，直接判定为 DENY；
 * 3. 仅拦截写入真实文件的重定向与内容改写命令 (如 > file、tee file、sed -i)；丢弃输出 (>/dev/null)、fd 复制 (2>&1) 放行；
 * 4. heredoc 正文按数据处理（未加引号分隔符的正文仅提取命令替换）；命令替换 ($(...)、`...`) 递归评估；
 * 5. 模式匹配敏感指令 (如 git push --force, chmod -R 777, shutdown 等)，动态提升为需要用户确认 (ASK)；
 * 6. 结构性文件操作 (touch/mkdir/cp/mv) 不硬拦截，交由权限确认流程处理；
 * 7. 纯函数设计，不产生副作用，便于单测与跨模块复用。
 *
 * 边界：本守卫只覆盖可枚举的 shell 命令形态，不是沙箱。解释器内写文件 (python -c / node -e)、
 * dd of=<file>、install 等旁路，以及 rm -f <path> 这类常规删除，均由权限审批 (ask) 兜底。
 */

export type CommandSafetyLevel = "safe" | "sensitive" | "dangerous"

export interface CommandSafetyEvaluation {
  level: CommandSafetyLevel
  reason?: string
  matchedCommand?: string
}

const MAX_WRAPPER_DEPTH = 8
const MAX_SUBSTITUTION_DEPTH = 8

// 绝对破坏性指令（直接阻断 / DENY）
// 注意：`.*` 一律收敛为 `[^;&|]*`，让模式限定在单条子命令内，避免跨 `;`/`|`/`&` 误拼匹配；
// rm 的受保护目标由 isDangerousRmCommand 结构化判定（引号/变量/路径归一化），不用正则匹配。
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\s*git\s+reset\s+--hard(\s|$)/i,
    reason:
      "Destructive git reset --hard is prohibited to prevent uncommitted changes from being lost.",
  },
  {
    pattern: /^\s*git\s+clean\s+[^;&|]*-[a-zA-Z]*f[a-zA-Z]*(\s|$)/i,
    reason: "Forced removal of untracked files (git clean -f) is prohibited.",
  },
  {
    pattern: /^\s*mkfs(\.[a-zA-Z0-9]+)?(\s|$)/i,
    reason: "Formatting disk filesystems is prohibited.",
  },
  {
    pattern: /^\s*dd\s+[^;&|]*if=[^;&|]*of=(\/dev\/[a-zA-Z0-9]+)(\s|$)/i,
    reason: "Overwriting raw disk devices (dd of=/dev/...) is prohibited.",
  },
  {
    pattern: /^\s*:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:\s*$/,
    reason: "Fork bombs are prohibited.",
  },
]

// 敏感指令（提升为必须经用户确认 / ASK）
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\s*git\s+push\s+[^;&|]*(-[a-zA-Z]*f[a-zA-Z]*|--force)(\s|$)/i,
    reason: "Force pushing to remote git repositories may overwrite others' commits.",
  },
  {
    pattern: /^\s*git\s+checkout\s+(--\s+)?\.(\s|$)/i,
    reason: "Discarding all unstaged changes in working directory.",
  },
  {
    pattern: /^\s*chmod\s+[^;&|]*-[a-zA-Z]*R[a-zA-Z]*\s+777(\s|$)/i,
    reason: "Recursively granting 777 permissions introduces security risks.",
  },
  {
    pattern: /^\s*shutdown(\s|$)|^\s*reboot(\s|$)/i,
    reason: "System shutdown or reboot operation.",
  },
]

// 目标为 null 设备或当前进程 fd：仅丢弃输出 / 复制 fd，不创建或改写文件。
const isNullOutputTarget = (target: string): boolean =>
  target === "/dev/null" || /^\/dev\/(?:stdout|stderr|fd\/\d+)$/.test(target)

// shell 词边界：重定向目标在此截断。
const TARGET_DELIMITERS = new Set([" ", "\t", "\n", ";", "&", "|", "<", ">", "(", ")", "="])

interface ShellWord {
  word: string
  end: number
  // 词中出现过引号或转义（heredoc 以此判断正文是否做替换）
  quoted: boolean
}

/**
 * 从 start 处读取一个 shell 词：处理单/双引号与反斜杠转义，遇到未加引号的 stop 字符结束。
 */
const readShellWord = (source: string, start: number, stop: Set<string>): ShellWord => {
  let word = ""
  let quoted = false
  let i = start

  while (i < source.length) {
    const ch = source[i]
    if (ch === "\\") {
      quoted = true
      word += source[i + 1] ?? ""
      i += 2
      continue
    }
    if (ch === "'" || ch === '"') {
      quoted = true
      i++
      while (i < source.length && source[i] !== ch) {
        if (ch === '"' && source[i] === "\\") i++
        word += source[i]
        i++
      }
      i++
      continue
    }
    if (stop.has(ch)) break
    word += ch
    i++
  }

  return { word, end: i, quoted }
}

/**
 * 模式匹配前的引号归一化：去掉引号字符并把 ${VAR} 归一为 $VAR。
 * 破坏性/敏感模式在原文上匹配，不归一化的话 rm -rf "$HOME"、git push "--force" 这类写法会绕过。
 */
const stripQuotes = (text: string): string =>
  text.replace(/["']/g, "").replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, "$$$1")

interface CommandSubstitution {
  inner: string
  end: number
  // 算术展开 $((...))：表达式本身不是命令，仅递归提取其中嵌套的命令替换
  arithmetic: boolean
}

// 从 position 处匹配命令替换：`$(...)`、`$((...))` 与反引号；不匹配返回 null。
const matchCommandSubstitution = (text: string, position: number): CommandSubstitution | null => {
  const ch = text[position]

  if (ch === "`") {
    let j = position + 1
    let inner = ""
    while (j < text.length && text[j] !== "`") {
      if (text[j] === "\\") {
        inner += text[j + 1] ?? ""
        j += 2
        continue
      }
      inner += text[j]
      j++
    }
    return { inner, end: j + 1, arithmetic: false }
  }

  if (ch !== "$" || text[position + 1] !== "(") return null

  const arithmetic = text[position + 2] === "("
  const openCount = arithmetic ? 2 : 1
  const contentStart = position + 1 + openCount
  let depth = openCount
  let j = contentStart

  while (j < text.length && depth > 0) {
    const c = text[j]
    if (c === "\\") {
      j += 2
      continue
    }
    if (c === "'" || c === '"') {
      const quote = c
      j++
      while (j < text.length && text[j] !== quote) {
        if (quote === '"' && text[j] === "\\") j++
        j++
      }
      j++
      continue
    }
    if (c === "(") depth++
    else if (c === ")") depth--
    if (depth === 0) break
    j++
  }

  return { inner: text.slice(contentStart, j), end: j + 1, arithmetic }
}

/**
 * 提取会被 shell 执行的命令替换正文：`$(...)`、反引号与算术展开内嵌套的替换。
 * 单引号内不展开（跳过），双引号内仍会执行（继续提取）；`\$(` / `\`` 转义不提取。
 */
const extractCommandSubstitutions = (text: string): string[] => {
  const found: string[] = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]

    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "'") {
      i++
      while (i < text.length && text[i] !== "'") i++
      i++
      continue
    }
    // 双引号不阻断命令替换，仅跳过其中的普通字符
    if (ch === '"') {
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") {
          i += 2
          continue
        }
        const substitution = matchCommandSubstitution(text, i)
        if (!substitution) {
          i++
          continue
        }
        if (substitution.arithmetic) {
          found.push(...extractCommandSubstitutions(substitution.inner))
        } else {
          found.push(substitution.inner)
        }
        i = substitution.end
      }
      i++
      continue
    }

    const substitution = matchCommandSubstitution(text, i)
    if (substitution) {
      if (substitution.arithmetic) {
        found.push(...extractCommandSubstitutions(substitution.inner))
      } else {
        found.push(substitution.inner)
      }
      i = substitution.end
      continue
    }
    i++
  }
  return found
}

/**
 * 命令中是否存在写入真实文件的重定向（> file、>> file、2> file、&> file）。
 * 按 shell 语法扫描：引号内的 `>` 不是重定向，引号包裹的目标（> "out file.txt"）仍按文件写入处理；
 * fd 复制 (2>&1)、进程替换 (>(cmd))、箭头/比较符 (->、=>、<=>) 与丢弃输出 (>/dev/null) 不匹配。
 * 命令替换（$(...) 等）整体跳过，其内容由 extractCommandSubstitutions 单独提取评估。
 */
const hasFileRedirection = (commandStr: string): boolean => {
  let i = 0
  while (i < commandStr.length) {
    const ch = commandStr[i]

    // 引号段整体跳过；双引号内允许反斜杠转义
    if (ch === "'" || ch === '"') {
      i++
      while (i < commandStr.length && commandStr[i] !== ch) {
        if (ch === '"' && commandStr[i] === "\\") i++
        i++
      }
      i++
      continue
    }
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "$" || ch === "`") {
      const substitution = matchCommandSubstitution(commandStr, i)
      if (substitution) {
        i = substitution.end
        continue
      }
    }

    const prev = commandStr[i - 1]
    if (ch !== ">" || prev === "-" || prev === "=" || prev === "<") {
      i++
      continue
    }

    let j = i + (commandStr[i + 1] === ">" ? 2 : 1)
    if (commandStr[j] === "|") j++ // >| 覆盖写
    while (commandStr[j] === " " || commandStr[j] === "\t") j++
    if (commandStr[j] === "&") {
      i = j + 1 // > &1：fd 复制，不写文件
      continue
    }

    // 读取重定向目标词（可能被引号包裹或含转义）
    const { word: target, end } = readShellWord(commandStr, j, TARGET_DELIMITERS)
    if (target && !isNullOutputTarget(target)) return true
    i = Math.max(end, i + 1)
  }
  return false
}

// rm 的受保护目标：根 / 家目录 / 父目录 / 当前目录 / 通配清空。
const DANGEROUS_RM_TARGETS = new Set([
  "/",
  "/*",
  "~",
  "~/*",
  "$HOME",
  "$HOME/*",
  ".",
  "*",
  ".*",
  "..",
  "../*",
])

const DANGEROUS_RM_REASON =
  "Force removal of a protected target (/, ~, $HOME, .., cwd, or all files) is prohibited (rm -rf)."

// 归一化 rm 目标词：${VAR} → $VAR、折叠重复斜杠、去掉 "." 路径段。
const normalizeRmTarget = (word: string): string => {
  const text = stripQuotes(word)
  const absolute = text.startsWith("/")
  const segments = text.split("/").filter((segment) => segment !== "" && segment !== ".")
  if (segments.length === 0) return absolute ? "/" : "."
  return `${absolute ? "/" : ""}${segments.join("/")}`
}

// rm 语句的词边界与语句结束符（未加引号时，分隔符之后属于别的命令）。
const RM_WORD_STOP = new Set([" ", "\t", "\n", ";", "&", "|", "(", ")"])
const STATEMENT_END = new Set([";", "&", "|", "(", ")"])

/**
 * rm 命令是否指向受保护目标：按 shell 词解析（引号/转义感知），遇到未加引号的分隔符即截止，
 * 目标词做 ${VAR} 与路径归一化后与 DANGEROUS_RM_TARGETS 比对；仅当带强删标志 (-f/--force) 时成立。
 */
const isDangerousRmCommand = (command: string): boolean => {
  const match = /^\s*rm\s+([\s\S]*)$/i.exec(command)
  if (!match) return false

  const args = match[1]
  const targets: string[] = []
  let hasForce = false
  let i = 0

  while (i < args.length) {
    while (i < args.length && (args[i] === " " || args[i] === "\t" || args[i] === "\n")) i++
    if (i >= args.length || STATEMENT_END.has(args[i])) break

    const { word, end } = readShellWord(args, i, RM_WORD_STOP)
    i = end
    if (word === "--force" || /^-[a-zA-Z]*f[a-zA-Z]*$/i.test(word)) hasForce = true
    else if (!word.startsWith("-")) targets.push(normalizeRmTarget(word))
  }

  return (
    hasForce && targets.some((target) => DANGEROUS_RM_TARGETS.has(target) || target.endsWith("/.."))
  )
}

// 内容改写类 shell 命令：重定向之外的写文件通道。结构性操作 (touch/mkdir/cp/mv) 不在此列。
const isContentWriteCommand = (commandStr: string): boolean => {
  // tee：仅当指定真实文件参数时写文件（`cmd | tee` 只写 stdout）
  const teeTarget = commandStr.match(
    /^\s*tee\b(?:\s+-{1,2}[a-zA-Z][a-zA-Z-]*(?:=\S+)?)*\s+(\S+)/,
  )?.[1]
  if (teeTarget && !isNullOutputTarget(teeTarget.replace(/^["']|["']$/g, ""))) return true
  // sed -i / --in-place：原地改写文件
  if (/^\s*sed\b[^;&|]*(?:\s-i|\s--in-place)/.test(commandStr)) return true
  // truncate：调整文件大小
  if (/^\s*truncate\b/.test(commandStr)) return true
  return false
}

// heredoc 分隔符词的终止字符。
const HEREDOC_WORD_END = new Set([" ", "\t", ";", "&", "|", "<", ">", "(", ")"])

interface HeredocDelimiter {
  delimiter: string
  stripTabs: boolean
  // 分隔符含引号/转义 → 正文按字面量处理，不做参数与命令替换
  quoted: boolean
}

// 解析单行中的 heredoc 操作符（引号外的 `<<`/`<<-`；排除 `<<<` herestring 与注释）。
const findHeredocs = (line: string): HeredocDelimiter[] => {
  const found: HeredocDelimiter[] = []
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (ch === "'" || ch === '"') {
      i++
      while (i < line.length && line[i] !== ch) {
        if (ch === '"' && line[i] === "\\") i++
        i++
      }
      i++
      continue
    }
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) break
    if (ch !== "<" || line[i - 1] === "<" || line[i + 1] !== "<" || line[i + 2] === "<") {
      i++
      continue
    }

    const stripTabs = line[i + 2] === "-"
    let j = i + 2 + (stripTabs ? 1 : 0)
    while (line[j] === " " || line[j] === "\t") j++

    const { word: delimiter, end, quoted } = readShellWord(line, j, HEREDOC_WORD_END)
    if (delimiter) found.push({ delimiter, stripTabs, quoted })
    i = Math.max(end, i + 1)
  }
  return found
}

interface SanitizedCommand {
  command: string
  // 未加引号分隔符的正文会做替换：其中会被 shell 执行的命令替换正文
  substitutions: string[]
}

/**
 * 移除 heredoc 数据体（`<<EOF ... EOF`、`<<-EOF`、`<<'EOF'`）：正文是数据，不参与命令扫描。
 * 加引号的分隔符（`<<'EOF'`、`<<"EOF"`、`<<\EOF`）正文完全字面量，整段丢弃；
 * 未加引号的分隔符正文会做参数/命令替换，丢弃前提取其中的命令替换交回调用方评估。
 * 终止符须整行匹配（`<<-` 允许行首 Tab）；同一行多个 heredoc 按出现顺序消费各自正文；
 * 未闭合的 heredoc 也按正文处理（bash 对 EOF 处未终止的 heredoc 仍会执行命令）。
 */
const stripHeredocBodies = (commandStr: string): SanitizedCommand => {
  if (!commandStr.includes("<<")) return { command: commandStr, substitutions: [] }

  const kept: string[] = []
  const substitutions: string[] = []
  const queue: HeredocDelimiter[] = []
  let body: string[] = []

  const finishBody = (): void => {
    const current = queue.shift()
    if (current && !current.quoted && body.length > 0) {
      substitutions.push(...extractCommandSubstitutions(body.join("\n")))
    }
    body = []
  }

  for (const line of commandStr.split("\n")) {
    if (queue.length > 0) {
      const current = queue[0]
      const terminator = current.stripTabs ? line.replace(/^\t+/, "") : line
      if (terminator === current.delimiter) {
        finishBody()
      } else {
        body.push(line)
      }
      continue
    }
    kept.push(line)
    queue.push(...findHeredocs(line))
  }

  if (queue.length > 0) finishBody()

  return { command: kept.join("\n"), substitutions }
}

/**
 * 递归解析包装层并获取实际执行的核心命令行
 */
export function unwrapCommand(commandStr: string, depth = 0): string {
  if (depth > MAX_WRAPPER_DEPTH) {
    return commandStr
  }

  const trimmed = commandStr.trim()

  // 反斜杠转义命令名: \rm → rm
  if (/^\\[a-zA-Z_]/.test(trimmed)) {
    return unwrapCommand(trimmed.slice(1), depth + 1)
  }

  // 引号包裹命令名: 'rm' -rf /、"rm" -rf /
  const quotedCommand = /^(["'])([^"']+)\1(?:\s+([\s\S]*))?$/.exec(trimmed)
  if (quotedCommand?.[2]) {
    const rest = quotedCommand[3]?.trim()
    return unwrapCommand(rest ? `${quotedCommand[2]} ${rest}` : quotedCommand[2], depth + 1)
  }

  // 处理 sudo 包装: sudo [options] <command>
  if (/^sudo\s+/i.test(trimmed)) {
    const withoutSudo = trimmed.replace(/^sudo(\s+-[a-zA-Z0-9]+)*\s+/i, "")
    return unwrapCommand(withoutSudo, depth + 1)
  }

  // 处理 env 包装: env [VAR=VAL ...] <command>
  if (/^env\s+/i.test(trimmed)) {
    const withoutEnv = trimmed.replace(
      /^env(\s+[a-zA-Z_][a-zA-Z0-9_]*=[^\s]*|\s+-[a-zA-Z0-9]+)*\s+/i,
      "",
    )
    return unwrapCommand(withoutEnv, depth + 1)
  }

  // 处理 eval / command 包装: eval "rm -rf /"、command rm -rf /
  const builtinMatch = /^(?:eval|command)\s+([\s\S]*)$/i.exec(trimmed)
  if (builtinMatch?.[1]?.trim()) {
    return unwrapCommand(builtinMatch[1], depth + 1)
  }

  // 处理 shell -c 包装: sh -c "...", bash -lc '...', bash -l -c '...', zsh -ic "..."
  const shellMatch = trimmed.match(
    /^(?:sh|bash|zsh)\s+(?:-[a-zA-Z]+\s+)*-[a-zA-Z]*c[a-zA-Z]*\s+["']([\s\S]*)["']$/i,
  )
  if (shellMatch?.[1]) {
    return unwrapCommand(shellMatch[1], depth + 1)
  }

  return trimmed
}

/**
 * 顶层子命令拆分：`&&`、`||`、`;`、`|`、`&` 与换行在 shell 顶层是命令边界，出现在引号、转义、
 * 命令替换或进程替换内部时只是数据。盲拆会破坏引号上下文（多行引号参数被肢解，其中的 `>` 被
 * 误判为写文件重定向），故按 shell 词法单遍扫描后再拆。
 */
const splitTopLevelCommands = (commandStr: string): string[] => {
  const parts: string[] = []
  let current = ""
  let i = 0

  while (i < commandStr.length) {
    const ch = commandStr[i]

    // 转义字符与其后字符是数据
    if (ch === "\\") {
      current += commandStr.slice(i, i + 2)
      i += 2
      continue
    }

    // 引号段整体保留：引号内的分隔符不是命令边界
    if (ch === "'" || ch === '"') {
      const start = i
      i++
      while (i < commandStr.length && commandStr[i] !== ch) {
        if (ch === '"' && commandStr[i] === "\\") i++
        i++
      }
      i++
      current += commandStr.slice(start, i)
      continue
    }

    // 命令替换整体保留：其正文由 extractCommandSubstitutions 单独递归评估
    if (ch === "$" || ch === "`") {
      const substitution = matchCommandSubstitution(commandStr, i)
      if (substitution) {
        current += commandStr.slice(i, substitution.end)
        i = substitution.end
        continue
      }
    }

    // 进程替换 <(cmd) / >(cmd) 整体保留：括号内是另一条命令的正文
    if ((ch === "<" || ch === ">") && commandStr[i + 1] === "(") {
      const start = i
      let depth = 0
      while (i < commandStr.length) {
        if (commandStr[i] === "(") depth++
        else if (commandStr[i] === ")" && --depth === 0) {
          i++
          break
        }
        i++
      }
      current += commandStr.slice(start, i)
      continue
    }

    // 顶层命令边界
    if (commandStr.startsWith("&&", i) || commandStr.startsWith("||", i)) {
      parts.push(current)
      current = ""
      i += 2
      continue
    }
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "\r") {
      parts.push(current)
      current = ""
      i++
      continue
    }
    if (ch === "&") {
      const prev = commandStr[i - 1]
      // fd 复制 (2>&1) 与重定向 (>&2、&>file) 不是命令边界
      if (prev !== ">" && prev !== "<" && commandStr[i + 1] !== ">") {
        parts.push(current)
        current = ""
      } else {
        current += ch
      }
      i++
      continue
    }

    current += ch
    i++
  }

  parts.push(current)
  return parts.map((part) => part.trim()).filter(Boolean)
}

/**
 * 评估单条 Shell 指令的安全性
 */
export function evaluateCommandSafety(commandStr: string, depth = 0): CommandSafetyEvaluation {
  if (!commandStr || typeof commandStr !== "string") {
    return { level: "safe" }
  }
  if (depth > MAX_SUBSTITUTION_DEPTH) {
    return {
      level: "dangerous",
      reason: "[Security Guard] Command substitution nesting is too deep to analyze.",
      matchedCommand: commandStr,
    }
  }

  // heredoc 正文是数据，先从命令文本中剥除；未加引号分隔符的正文仅取其中的命令替换
  const { command, substitutions } = stripHeredocBodies(commandStr)

  // 命令替换 ($(...)、`...`) 会被 shell 执行：递归评估其正文
  for (const substitution of [...substitutions, ...extractCommandSubstitutions(command)]) {
    const verdict = evaluateCommandSafety(substitution, depth + 1)
    if (verdict.level !== "safe") return verdict
  }

  // 顶层分隔符拆分子命令逐个评估（引号与替换内的分隔符不拆分）
  const subCommands = splitTopLevelCommands(command)

  for (const rawSubCmd of subCommands) {
    const unwrapped = unwrapCommand(rawSubCmd)
    const normalized = stripQuotes(unwrapped)
    const normalizedRaw = stripQuotes(rawSubCmd)

    // 0. 包装层（sudo/env/eval/sh -c ...）解开后是不同的命令文本：递归评估载荷，
    //    保证引号里的分隔符（sh -c "cd /tmp && rm -rf /"）在不再盲拆后仍能被命中。
    if (unwrapped !== rawSubCmd.trim()) {
      const verdict = evaluateCommandSafety(unwrapped, depth + 1)
      if (verdict.level !== "safe") return verdict
    }

    // 1. 优先检查绝对破坏性指令：rm 的受保护目标（引号/变量/路径归一化后判定）
    if (isDangerousRmCommand(unwrapped) || isDangerousRmCommand(rawSubCmd)) {
      return {
        level: "dangerous",
        reason: `[Security Guard] ${DANGEROUS_RM_REASON}`,
        matchedCommand: unwrapped,
      }
    }
    for (const { pattern, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(normalized) || pattern.test(normalizedRaw)) {
        return {
          level: "dangerous",
          reason: `[Security Guard] ${reason}`,
          matchedCommand: unwrapped,
        }
      }
    }

    // 2. 仅拦截把输出写入真实文件的重定向（如 echo ... > file）；丢弃输出与 fd 复制放行
    if (hasFileRedirection(unwrapped) || hasFileRedirection(rawSubCmd)) {
      return {
        level: "dangerous",
        reason:
          '[Security Guard] Shell redirection that writes to a file (">", ">>") is blocked. Discarding output (2>/dev/null, &>/dev/null) is allowed; re-run without the file redirection, or use the write, edit, or apply_patch tool to create or modify files.',
        matchedCommand: unwrapped,
      }
    }

    // 3. 内容改写命令（tee file、sed -i、truncate）：与重定向同级，封死 shell 写文件通道
    if (isContentWriteCommand(normalized) || isContentWriteCommand(normalizedRaw)) {
      return {
        level: "dangerous",
        reason:
          "[Security Guard] Shell commands that rewrite file contents (tee <file>, sed -i, truncate) are blocked in this environment. Use the write, edit, or apply_patch tool to change files.",
        matchedCommand: unwrapped,
      }
    }
  }

  const unwrapped = unwrapCommand(command)
  const normalized = stripQuotes(unwrapped)
  const normalizedCommand = stripQuotes(command)

  // 4. 检查全局绝对破坏性指令
  if (isDangerousRmCommand(unwrapped) || isDangerousRmCommand(command)) {
    return {
      level: "dangerous",
      reason: `[Security Guard] ${DANGEROUS_RM_REASON}`,
      matchedCommand: unwrapped,
    }
  }
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(normalizedCommand)) {
      return {
        level: "dangerous",
        reason: `[Security Guard] ${reason}`,
        matchedCommand: unwrapped,
      }
    }
  }

  // 5. 检查敏感需确认指令
  for (const { pattern, reason } of SENSITIVE_PATTERNS) {
    if (pattern.test(normalized) || pattern.test(normalizedCommand)) {
      return {
        level: "sensitive",
        reason: `[Security Guard] ${reason}`,
        matchedCommand: unwrapped,
      }
    }
  }

  return { level: "safe" }
}
