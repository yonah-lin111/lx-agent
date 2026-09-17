import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// 测试期间把应用数据根目录隔离到临时目录，避免测试写入真实 ~/.lx（数据库、配置等）。
process.env.LX_AGENT_DATA_ROOT = mkdtempSync(join(tmpdir(), "lx-agent-test-"))
// 测试期间把跨客户端标准目录隔离到临时目录，避免读到开发机上真实的 ~/.agents/skills。
process.env.LX_AGENT_AGENTS_HOME = mkdtempSync(join(tmpdir(), "lx-agent-agents-test-"))
