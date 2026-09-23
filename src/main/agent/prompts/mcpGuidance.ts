/**
 * 代码检索类 MCP 策略指引（系统提示词动态分段 `agent:mcp-guidance`）。
 *
 * 仅当 server 已连接且被当前 agent 允许时才注入：调用方过滤后经
 * `AssembleContext.mcpServers` 传入 server 名列表；未知 server 直接忽略。
 * 两个 server 职责不同，指引块分开表达，禁止混为一谈。
 */

/** 通用优先级策略：两个 server 都是调研项目的首选策略 */
export const MCP_GUIDANCE_PRIORITY = [
  "These MCP servers are the PRIMARY strategy for researching and locating code in any project.",
  "Query them BEFORE falling back to grep/find/read-based exploration.",
  "They are complementary, not interchangeable: CodeGraph answers symbol-level and file-level questions in one call; Codebase Memory answers repository-level, structural-graph and cross-project questions.",
].join(" ")

/** server 名 → 指引块（行数组，便于维护与断言；名称按小写匹配） */
const MCP_GUIDANCE_BLOCKS: Record<string, string[]> = {
  codegraph: [
    '  <server name="codegraph">',
    "    <role>",
    "      Pre-built local code index (Read-equivalent). codegraph_explore returns the verbatim, line-numbered source of the relevant symbols grouped by file, the call paths between them (including dynamic-dispatch hops), and a blast-radius summary — usually in a single call with zero file reads.",
    "    </role>",
    "    <when_to_use>",
    '      "How does X work", "where is X", "how does X reach Y", surveys of an area, and impact checks before editing existing code.',
    "    </when_to_use>",
    "    <initialization>",
    "      If codegraph_explore is unavailable because the workspace has no .codegraph/ index, the server is inactive. For a programming project, initialize it once from the project root in the shell: `codegraph init`. Never initialize non-code folders. The index auto-syncs with file changes afterwards.",
    "    </initialization>",
    "  </server>",
  ],
  "codebase-memory-mcp": [
    '  <server name="codebase-memory-mcp">',
    "    <role>",
    "      Persistent repository-level knowledge graph (multi-project, SQLite-backed, auto-synced after indexing).",
    "    </role>",
    "    <when_to_use>",
    "      Who calls X / what X calls (trace_path), whole-repo architecture (get_architecture), dead code and hotspots/complexity, structural searches (search_graph), cross-service HTTP links, multi-hop Cypher queries (query_graph), and any project you will revisit across sessions.",
    "    </when_to_use>",
    "    <initialization>",
    "      Call list_projects first; if the working project or a reference repository you are about to read is not listed, call index_repository with its repo_path before exploring it. Index programming projects proactively without asking; do not index document-only or data-only folders.",
    "    </initialization>",
    "  </server>",
  ],
}

/**
 * 生成 MCP 策略指引段；没有任何已知 server 可用时返回空串（整段不注入）。
 */
export const formatMcpGuidancePrompt = (servers: readonly string[]): string => {
  const blocks: string[] = []
  const seen = new Set<string>()
  for (const server of servers) {
    const key = server.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const block = MCP_GUIDANCE_BLOCKS[key]
    if (block) {
      blocks.push(...block)
    }
  }
  if (blocks.length === 0) {
    return ""
  }
  return [
    "<mcp_guidance>",
    `  <priority>${MCP_GUIDANCE_PRIORITY}</priority>`,
    ...blocks,
    "</mcp_guidance>",
  ].join("\n")
}
