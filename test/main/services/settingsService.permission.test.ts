import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readConfigTree, writeConfigTree } from "../../helpers/configLayout"

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

  const readConfig = (): Record<string, unknown> => readConfigTree(holder.configPath)

  it("缺失节点回退默认（default 模式 + 空规则）", () => {
    writeConfigTree(holder.configPath, {})
    expect(getPermissionSettings()).toEqual({
      defaultMode: "default",
      sandboxPolicy: "workspace-write",
      allow: [],
      deny: [],
      ask: [],
    })
  })

  it("读取已有配置（含非法条目降级）", () => {
    writeConfigTree(holder.configPath, {
      agent: {
        permissions: {
          defaultMode: "acceptEdits",
          allow: ["Bash(git status)", 42],
          deny: [],
          ask: ["Bash(docker *)"],
        },
      },
    })
    expect(getPermissionSettings()).toEqual({
      defaultMode: "acceptEdits",
      sandboxPolicy: "workspace-write",
      allow: ["Bash(git status)"],
      deny: [],
      ask: ["Bash(docker *)"],
    })
  })

  it("defaultMode 非法回退 default", () => {
    writeConfigTree(holder.configPath, {
      agent: { permissions: { defaultMode: "plan" } },
    })
    expect(getPermissionSettings().defaultMode).toBe("default")
  })

  it("保存合并 agent.permissions 并保留 agent.mcp 与其他节点", () => {
    writeConfigTree(holder.configPath, {
      ai: { defaultModel: { provider: "p", model: "m" } },
      agent: {
        mcp: { servers: [{ name: "codegraph" }] },
        permissions: { defaultMode: "default", allow: [], deny: [], ask: [] },
      },
    })

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

  it("规范化 modes：丢弃非法模式键/未知工具名，硬基线工具剥离，保留显式空数组", () => {
    writeConfigTree(holder.configPath, {
      agent: {
        permissions: {
          defaultMode: "default",
          allow: [],
          deny: [],
          ask: [],
          modes: {
            build: { tools: ["read", "write", "unknown_tool"] },
            plan: {
              tools: ["read", "write", "memory", "wireframe"],
              websearch: ["web_search", "bash"],
            },
            review: { tools: [], mcp: ["codegraph", "codegraph", " "], skills: ["deploy"] },
            design: { tools: ["read", "wireframe"] },
            bogus: { tools: ["read"] },
          },
        },
      },
    })

    expect(getPermissionSettings().modes).toEqual({
      build: { tools: ["read", "write"] },
      plan: { tools: ["read", "wireframe"], websearch: ["web_search"] },
      review: { tools: [], mcp: ["codegraph"], skills: ["deploy"] },
      design: { tools: ["read"] },
    })
  })

  it("规范化 modes.subagents：去重去空白，角色名不受工具目录限制", () => {
    writeConfigTree(holder.configPath, {
      agent: {
        permissions: {
          defaultMode: "default",
          allow: [],
          deny: [],
          ask: [],
          modes: {
            build: { subagents: [" explorer ", "worker", "explorer", "", 42, "custom-role"] },
            plan: { subagents: ["explorer"] },
          },
        },
      },
    })

    expect(getPermissionSettings().modes).toEqual({
      build: { subagents: ["explorer", "worker", "custom-role"] },
      plan: { subagents: ["explorer"] },
    })
  })

  it("非法 modes 结构归并为 undefined（不落空节点）", () => {
    writeConfigTree(holder.configPath, {
      agent: { permissions: { defaultMode: "default", modes: { plan: "bad", review: [] } } },
    })
    expect(getPermissionSettings().modes).toBeUndefined()

    writeConfigTree(holder.configPath, {
      agent: { permissions: { defaultMode: "default", modes: [] } },
    })
    expect(getPermissionSettings().modes).toBeUndefined()
  })

  it("保存 modes 时剥离硬基线工具（配置不可放开写操作）", () => {
    savePermissionSettings({
      defaultMode: "default",
      allow: [],
      deny: [],
      ask: [],
      modes: {
        build: { tools: ["write", "read"] },
        review: { tools: ["read", "write", "memory", "task"] },
        design: { tools: ["read", "wireframe"] },
      },
    })

    const config = readConfig()
    expect(config.agent).toMatchObject({
      permissions: {
        modes: {
          build: { tools: ["write", "read"] },
          // task 由 subagents 白名单控制，不再作为硬基线剥离。
          review: { tools: ["read", "task"] },
          design: { tools: ["read"] },
        },
      },
    })
  })
})
