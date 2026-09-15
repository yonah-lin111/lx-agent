import type { AgentRestoredSession, AgentSessionSummary } from "@shared/contracts/agent"
import { buildSessionHero, buildStatsGrid, buildStickyHeader } from "./documentBody"
import { escapeHtml } from "./htmlUtils"
import { renderSessionMessages } from "./renderSessionMessages"
import { SESSION_SCRIPT } from "./script"
import { SESSION_STYLES } from "./styles"

/**
 * 生成内嵌的独立交互式 HTML 会话报告（Emil Kowalski & Apple Fluid Design）
 */
export function generateSessionHtml(
  session: AgentRestoredSession,
  summary?: Partial<AgentSessionSummary>,
): string {
  const title = summary?.title || "Agent 对话导出报告"
  const sessionId = summary?.id || "unknown-session"
  const createdAt = summary?.createdAt || new Date().toISOString()
  const cwd = summary?.cwd || "-"

  const { messagesHtml, todosHtml, stats } = renderSessionMessages(session)

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Agent 对话导出报告</title>
  <style>${SESSION_STYLES}  </style>
</head>
<body>
${buildStickyHeader(title)}

  <main class="main-container">
${buildSessionHero(title, sessionId, createdAt, cwd)}

${buildStatsGrid(stats.userTurnCount, stats.assistantTurnCount, stats.totalToolCalls, stats.totalInputTokens, stats.totalOutputTokens)}

    ${todosHtml}

    <section class="chat-stream">
      ${messagesHtml.join("\n")}
    </section>
  </main>

${SESSION_SCRIPT}
</body>
</html>`
}
