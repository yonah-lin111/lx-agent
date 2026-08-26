/**
 * 指令安全守卫 (Command Safety Guard)
 *
 * 参考 codex-rs/shell-command/src/command_safety/is_dangerous_command.rs
 *
 * 核心机制：
 * 1. 递归拆解 shell 封装层 (如 sudo, env, sh -c, bash -c 等)，最深支持 8 层；
 * 2. 模式匹配绝对破坏性高危指令 (如 rm -rf /, git reset --hard, git clean -fdx, mkfs 等)，直接判定为 DENY；
 * 3. 模式匹配敏感指令 (如 git push --force, dd, chmod -R 777 等)，动态提升为需要用户确认 (ASK)；
 * 4. 纯函数设计，不产生副作用，便于单测与跨模块复用。
 */

export type CommandSafetyLevel = "safe" | "sensitive" | "dangerous"

export interface CommandSafetyEvaluation {
  level: CommandSafetyLevel
  reason?: string
  matchedCommand?: string
}

const MAX_WRAPPER_DEPTH = 8

// 绝对破坏性指令（直接阻断 / DENY）
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\s*rm\s+.*(-[a-zA-Z]*f[a-zA-Z]*|--force)\s+.*(\/|~|\$HOME|\.\.)(\s|$)/,
    reason: "禁止对系统根目录、家目录或上级目录执行强制删除 (rm -rf)",
  },
  {
    pattern: /^\s*rm\s+.*-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\/|~|\$HOME|\*)\s*$/,
    reason: "禁止执行全盘或根目录强制递归删除 (rm -rf / 或 rm -rf *)",
  },
  {
    pattern: /^\s*git\s+reset\s+--hard(\s|$)/,
    reason: "禁止直接执行未授权的破坏性 git reset --hard，以防丢失工作区未提交修改",
  },
  {
    pattern: /^\s*git\s+clean\s+.*-[a-zA-Z]*f[a-zA-Z]*(\s|$)/,
    reason: "禁止直接执行强制清理未跟踪文件 (git clean -f)",
  },
  {
    pattern: /^\s*mkfs(\.[a-zA-Z0-9]+)?(\s|$)/,
    reason: "禁止在终端格式化磁盘文件系统",
  },
  {
    pattern: /^\s*dd\s+.*if=.*of=(\/dev\/[a-zA-Z0-9]+)(\s|$)/,
    reason: "禁止对裸磁盘设备执行底层覆写 (dd of=/dev/...)",
  },
  {
    pattern: /^\s*:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:\s*$/,
    reason: "禁止执行 Fork 炸弹",
  },
]

// 敏感指令（提升为必须经用户确认 / ASK）
const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^\s*git\s+push\s+.*(-[a-zA-Z]*f[a-zA-Z]*|--force)(\s|$)/,
    reason: "强制推送到远端 Git 仓库可能覆盖他人提交",
  },
  {
    pattern: /^\s*git\s+checkout\s+(--\s+)?\.(\s|$)/,
    reason: "丢弃工作区所有未暂存改动",
  },
  {
    pattern: /^\s*chmod\s+.*-[a-zA-Z]*R[a-zA-Z]*\s+777(\s|$)/,
    reason: "全局递归赋予 777 宽松权限存在安全风险",
  },
  {
    pattern: /^\s*shutdown(\s|$)|^\s*reboot(\s|$)/,
    reason: "关机或重启系统操作",
  },
]

/**
 * 递归解析包装层并获取实际执行的核心命令行
 */
export function unwrapCommand(commandStr: string, depth = 0): string {
  if (depth > MAX_WRAPPER_DEPTH) {
    return commandStr
  }

  const trimmed = commandStr.trim()

  // 处理 sudo 包装: sudo [options] <command>
  if (/^sudo\s+/.test(trimmed)) {
    const withoutSudo = trimmed.replace(/^sudo(\s+-[a-zA-Z0-9]+)*\s+/, "")
    return unwrapCommand(withoutSudo, depth + 1)
  }

  // 处理 env 包装: env [VAR=VAL ...] <command>
  if (/^env\s+/.test(trimmed)) {
    const withoutEnv = trimmed.replace(/^env(\s+[a-zA-Z_][a-zA-Z0-9_]*=[^\s]*|\s+-[a-zA-Z0-9]+)*\s+/, "")
    return unwrapCommand(withoutEnv, depth + 1)
  }

  // 处理 shell -c 包装: sh -c "...", bash -c '...', zsh -c "..."
  const shellMatch = trimmed.match(/^(?:sh|bash|zsh)\s+-c\s+["'](.*)["']$/)
  if (shellMatch?.[1]) {
    return unwrapCommand(shellMatch[1], depth + 1)
  }

  return trimmed
}

/**
 * 评估单条 Shell 指令的安全性
 */
export function evaluateCommandSafety(commandStr: string): CommandSafetyEvaluation {
  if (!commandStr || typeof commandStr !== "string") {
    return { level: "safe" }
  }

  const unwrapped = unwrapCommand(commandStr)

  // 1. 优先检查绝对破坏性指令
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(unwrapped) || pattern.test(commandStr)) {
      return {
        level: "dangerous",
        reason: `[Security Guard] ${reason}`,
        matchedCommand: unwrapped,
      }
    }
  }

  // 2. 检查敏感需确认指令
  for (const { pattern, reason } of SENSITIVE_PATTERNS) {
    if (pattern.test(unwrapped) || pattern.test(commandStr)) {
      return {
        level: "sensitive",
        reason: `[Security Guard] ${reason}`,
        matchedCommand: unwrapped,
      }
    }
  }

  return { level: "safe" }
}
