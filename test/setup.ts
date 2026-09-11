import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// 测试期间把应用数据根目录隔离到临时目录，避免测试写入真实 ~/.lx（数据库、配置等）。
process.env.LX_AGENT_DATA_ROOT = mkdtempSync(join(tmpdir(), "lx-agent-test-"))
