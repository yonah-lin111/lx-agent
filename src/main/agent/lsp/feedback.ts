import type { Diagnostic } from "vscode-languageserver-types"
import type { LspManager } from "./lspManager"

export interface LspFeedbackDeps {
  lspManager?: LspManager
  getSessionId?: () => string | null
}

// 格式化 LSP 诊断信息供 ToolResult 反馈
export const formatLspDiagnosticsForFeedback = (
  filePath: string,
  diagnostics: Diagnostic[],
  maxCount: number = 8,
): string => {
  const count = diagnostics.length
  const header = `[LSP Diagnostics after modification (${count} error${count > 1 ? "s" : ""})]:`
  const shown = diagnostics.slice(0, maxCount)
  const lines: string[] = [header]
  for (const diag of shown) {
    const line = diag.range.start.line + 1
    const col = diag.range.start.character + 1
    const code = diag.code ? ` (${diag.code})` : ""
    lines.push(`- ${filePath}:${line}:${col}: ${diag.message}${code}`)
  }
  if (diagnostics.length > maxCount) {
    lines.push(`- ... and ${diagnostics.length - maxCount} more errors.`)
  }
  return lines.join("\n")
}

// 探测文件修改后的 LSP 诊断并生成文本后缀
export const checkLspDiagnosticsFeedback = async (
  filePath: string,
  absolutePath: string,
  cwd: string,
  deps?: LspFeedbackDeps,
  timeoutMs: number = 2000,
): Promise<{ textSuffix: string; errors: Diagnostic[] }> => {
  if (!deps?.lspManager || !deps.getSessionId) {
    return { textSuffix: "", errors: [] }
  }
  const sessionId = deps.getSessionId()
  if (!sessionId) {
    return { textSuffix: "", errors: [] }
  }

  try {
    const diagnostics = await deps.lspManager.getDiagnostics(
      sessionId,
      absolutePath,
      cwd,
      timeoutMs,
    )
    // 仅过滤 error 级别（1 或未指明默认 error）
    const errorDiagnostics = diagnostics.filter((d) => d.severity === 1 || d.severity === undefined)
    if (errorDiagnostics.length === 0) {
      return { textSuffix: "", errors: [] }
    }
    const formatted = formatLspDiagnosticsForFeedback(filePath, errorDiagnostics)
    return {
      textSuffix: `\n\n${formatted}`,
      errors: errorDiagnostics,
    }
  } catch {
    return { textSuffix: "", errors: [] }
  }
}
