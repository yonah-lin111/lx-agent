import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getItemCapabilities, getPageCapabilities } from "@/services/capabilityService"

// config 读取指向临时文件（隔离真实用户配置）。
const holder = vi.hoisted(() => ({ configPath: "" }))
vi.mock("@/paths", () => ({ getConfigPath: () => holder.configPath }))

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-capability-"))
  holder.configPath = join(tmpDir, "config.json")
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("capabilityService", () => {
  it("未配置时页面会话回退最小只读集，item 会话回退内置全集", () => {
    expect(getPageCapabilities("/")).toEqual({
      tools: ["read", "time", "web_search"],
      mcp: [],
      skills: [],
    })
    expect(getItemCapabilities()).toEqual({
      tools: ["read", "ls", "grep", "find", "write", "edit", "bash", "time", "web_search"],
      mcp: [],
      skills: [],
    })
  })

  it("按 config.json agent.pages[route] 解析能力集", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({
        agent: {
          pages: {
            "/settings": { tools: ["read"], mcp: ["srv"], skills: ["sk"] },
          },
        },
      }),
      "utf8",
    )

    expect(getPageCapabilities("/settings")).toEqual({
      tools: ["read"],
      mcp: ["srv"],
      skills: ["sk"],
    })
    // 未配置路由仍回退最小只读集 + 联网搜索。
    expect(getPageCapabilities("/project")).toEqual({
      tools: ["read", "time", "web_search"],
      mcp: [],
      skills: [],
    })
  })

  it("显式空能力集被保留（区别于未配置）", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({ agent: { pages: { "/settings": { tools: [] } } } }),
      "utf8",
    )

    expect(getPageCapabilities("/settings")).toEqual({ tools: [], mcp: [], skills: [] })
  })

  it("配置损坏或非法时回退最小只读集", () => {
    writeFileSync(holder.configPath, "not json", "utf8")
    expect(getPageCapabilities("/")).toEqual({
      tools: ["read", "time", "web_search"],
      mcp: [],
      skills: [],
    })

    writeFileSync(holder.configPath, JSON.stringify({ agent: { pages: { "/": "bad" } } }), "utf8")
    expect(getPageCapabilities("/")).toEqual({
      tools: ["read", "time", "web_search"],
      mcp: [],
      skills: [],
    })
  })
})
