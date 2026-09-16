// 移植自 9router open-sse/rtk/filters/buildOutput.js：压缩构建输出，保留错误/警告/摘要。
// Cargo/rustc 错误续行：" --> file:line"、"  |"、"N | code"、"  = note: ..."。
const RE_CARGO_ERR_CONT = /^\s*(-->|\||\d+\s*\||=)/
// 保留的弃用警告条数。
const DEPRECATION_KEEP = 3
// 保留的普通警告条数。
const WARNING_KEEP = 5

// 压缩构建输出：剥离进度/下载/编译噪音，保留错误、警告与最终摘要。
export const buildOutput = (input: string): string => {
  const lines = input.split("\n")
  if (lines.length === 0) return input

  const errors: string[] = []
  const warnings: string[] = []
  const deprecations: string[] = []
  let summary: string | null = null
  let compilingCount = 0
  let downloadingCount = 0
  let inCargoError = false

  for (const line of lines) {
    const trimmed = line.trim()

    // cargo 错误块续行原样保留。
    if (inCargoError) {
      if (!trimmed) {
        inCargoError = false
        continue
      }
      if (RE_CARGO_ERR_CONT.test(line)) {
        errors.push(line)
        continue
      }
      inCargoError = false
    }

    if (!trimmed) continue

    if (/^npm (ERR!|error)/i.test(trimmed) || /^yarn error/i.test(trimmed)) {
      errors.push(line)
      continue
    }

    if (/^npm warn deprecated/i.test(trimmed)) {
      deprecations.push(line)
      continue
    }
    if (/^npm warn/i.test(trimmed) || /^yarn warn/i.test(trimmed)) {
      warnings.push(line)
      continue
    }

    if (/^error(\[|:)/i.test(trimmed) || trimmed.startsWith("error -->")) {
      errors.push(line)
      inCargoError = true
      continue
    }

    if (/^warning(\[|:)/i.test(trimmed) || trimmed.startsWith("warning -->")) {
      warnings.push(line)
      inCargoError = true
      continue
    }

    if (/^ERROR:/i.test(trimmed)) {
      errors.push(line)
      continue
    }

    if (/^\[ERROR\]/i.test(trimmed) || /^BUILD FAILED/i.test(trimmed)) {
      errors.push(line)
      continue
    }

    if (/^\[WARNING\]/i.test(trimmed)) {
      warnings.push(line)
      continue
    }

    if (/^\s*Compiling\s+\S+/i.test(trimmed)) {
      compilingCount++
      continue
    }
    if (/^\s*Downloading\s+\S+/i.test(trimmed) || /^Fetching\s+/i.test(trimmed)) {
      downloadingCount++
      continue
    }

    if (
      /^(added|removed|changed|audited|installed)\s+\d+\s+package/i.test(trimmed) ||
      /^\s*Finished\s+/i.test(trimmed) ||
      /^BUILD SUCCESS/i.test(trimmed) ||
      /^\d+\s+(vulnerabilities|packages?|warnings?|errors?)/i.test(trimmed) ||
      /^Successfully (installed|built)/i.test(trimmed) ||
      /^To address .* issues/i.test(trimmed) ||
      /^Run `npm (audit|fund)`/i.test(trimmed) ||
      /packages are looking for funding/i.test(trimmed)
    ) {
      summary = summary ? `${summary}\n${line}` : line
    }
  }

  let out = ""

  for (const deprecation of deprecations.slice(0, DEPRECATION_KEEP)) out += `${deprecation}\n`
  if (deprecations.length > DEPRECATION_KEEP) {
    out += `... +${deprecations.length - DEPRECATION_KEEP} more deprecated packages\n`
  }

  if (compilingCount > 0) out += `Compiled ${compilingCount} packages\n`
  if (downloadingCount > 0) out += `Downloaded ${downloadingCount} packages\n`

  for (const error of errors) out += `${error}\n`

  for (const warning of warnings.slice(0, WARNING_KEEP)) out += `${warning}\n`
  if (warnings.length > WARNING_KEEP) {
    out += `... +${warnings.length - WARNING_KEEP} more warnings\n`
  }

  if (summary) out += `${summary}\n`

  return out.replace(/\n+$/, "") || input
}
