import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

// config 指向临时目录（隔离真实用户配置）。
vi.mock("@/paths", () => ({ getConfigPath: () => holder.configPath }))

import { getPermissionSettings, savePermissionSettings } from "@/services/settingsService"

let tmpDir: string

describe("settingsService 权限配置", () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "lx-permission-"))
    holder.configPath = join(tmpDir, "config.json")
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const readConfig = (): Record<string, unknown> =>
    JSON.parse(readFileSync(holder.configPath, "utf8"))

  it("缺失节点回退默认（default 模式 + 空规则）", () => {
    writeFileSync(holder.configPath, "{}\n", "utf8")
    expect(getPermissionSettings()).toEqual({
      defaultMode: "default",
      allow: [],
      deny: [],
      ask: [],
    })
  })

  it("读取已有配置（含非法条目降级）", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({
        agent: {
          permissions: {
            defaultMode: "acceptEdits",
            allow: ["Bash(git status)", 42],
            deny: [],
            ask: ["Bash(docker *)"],
          },
        },
      }),
      "utf8",
    )
    expect(getPermissionSettings()).toEqual({
      defaultMode: "acceptEdits",
      allow: ["Bash(git status)"],
      deny: [],
      ask: ["Bash(docker *)"],
    })
  })

  it("defaultMode 非法回退 default", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({ agent: { permissions: { defaultMode: "plan" } } }),
      "utf8",
    )
    expect(getPermissionSettings().defaultMode).toBe("default")
  })

  it("保存合并 agent.permissions 并保留 agent.mcp 与其他节点", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({
        ai: { defaultModel: { provider: "p", model: "m" } },
        agent: {
          mcp: { servers: [{ name: "codegraph" }] },
          permissions: { defaultMode: "default", allow: [], deny: [], ask: [] },
        },
      }),
      "utf8",
    )

    savePermissionSettings({
      defaultMode: "bypassPermissions",
      allow: ["Edit(src/**)"],
      deny: [],
      ask: [],
    })

    const config = readConfig()
    expect(config.agent).toMatchObject({
      mcp: { servers: [{ name: "codegraph" }] },
      permissions: {
        defaultMode: "bypassPermissions",
        allow: ["Edit(src/**)"],
        deny: [],
        ask: [],
      },
    })
    expect((config.ai as { defaultModel: unknown }).defaultModel).toEqual({
      provider: "p",
      model: "m",
    })
  })

  it("配置不存在时保存创建 agent.permissions", () => {
    savePermissionSettings({
      defaultMode: "default",
      allow: ["Bash(git status)"],
      deny: [],
      ask: [],
    })

    const config = readConfig()
    expect(config.agent).toMatchObject({
      permissions: { defaultMode: "default", allow: ["Bash(git status)"], deny: [], ask: [] },
    })
  })
})
