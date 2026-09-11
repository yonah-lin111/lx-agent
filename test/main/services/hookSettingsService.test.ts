import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getConfigPath: () => holder.configPath }
})

import { hookConfig } from "@/agent/hooks/hookConfig"
import { getHookSettings, saveHookSettings } from "@/services/settingsService"

let tempDir = ""
let warnSpy: ReturnType<typeof vi.spyOn>

const writeConfig = (config: unknown): void => {
  writeFileSync(holder.configPath, JSON.stringify(config, null, 2))
}

const readConfig = (): Record<string, unknown> =>
  JSON.parse(readFileSync(holder.configPath, "utf8")) as Record<string, unknown>

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "hook-settings-service-"))
  holder.configPath = join(tempDir, "config.json")
  hookConfig.reset()
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  rmSync(tempDir, { recursive: true, force: true })
})

describe("getHookSettings", () => {
  it("合法条目扁平化为一 hook 一组，保留 type/additionalContextLimit，非法条目告警并忽略", () => {
    writeConfig({
      agent: {
        permissions: { defaultMode: "default" },
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  name: "audit",
                  command: "cat >> /tmp/audit.log",
                  timeout: 5,
                  additionalContextLimit: 100,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: "bash|edit",
              hooks: [
                { command: "exit 0" },
                { name: "second", type: "command", command: "exit 0" },
              ],
            },
            "junk",
            { hooks: [] },
          ],
          NotAnEvent: [{ hooks: [{ command: "echo x" }] }],
        },
      },
    })

    const settings = getHookSettings()

    expect(settings.Stop).toEqual([
      {
        hooks: [
          {
            name: "audit",
            command: "cat >> /tmp/audit.log",
            timeout: 5,
            additionalContextLimit: 100,
          },
        ],
      },
    ])
    expect(settings.PreToolUse).toEqual([
      { matcher: "bash|edit", hooks: [{ name: "PreToolUse#2", command: "exit 0" }] },
      { matcher: "bash|edit", hooks: [{ name: "second", type: "command", command: "exit 0" }] },
    ])
    expect((settings as Record<string, unknown>).NotAnEvent).toBeUndefined()
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes("未知事件键"))).toBe(true)
    expect(warnSpy.mock.calls.some((call) => String(call[0]).includes("无 hooks"))).toBe(true)
  })

  it("缺失或非对象节点降级为空对象", () => {
    writeConfig({ agent: { permissions: {} } })
    expect(getHookSettings()).toEqual({})

    writeConfig({ agent: { hooks: "bad" } })
    expect(getHookSettings()).toEqual({})
  })
})

describe("saveHookSettings", () => {
  it("整树覆盖 agent.hooks 并保留其他节点；清 global 缓存但不动运行中会话缓存", () => {
    writeConfig({
      ai: { defaultModel: { provider: "p", model: "m" } },
      agent: {
        permissions: { defaultMode: "acceptEdits" },
        hooks: { Stop: [{ hooks: [{ name: "old", command: "echo old" }] }] },
      },
    })

    // 预先缓存 global（共享草稿作用域）与会话作用域。
    expect(hookConfig.get("global")[0]?.name).toBe("old")
    expect(hookConfig.get("sess-1")[0]?.name).toBe("old")

    const saved = saveHookSettings({
      Stop: [{ hooks: [{ name: "new", command: "echo new", timeout: 10 }] }],
    })
    expect(saved.Stop?.[0]?.hooks[0]).toMatchObject({ name: "new", timeout: 10 })

    const onDisk = readConfig()
    expect(onDisk.ai).toEqual({ defaultModel: { provider: "p", model: "m" } })
    expect((onDisk.agent as Record<string, unknown>).permissions).toEqual({
      defaultMode: "acceptEdits",
    })
    expect((onDisk.agent as Record<string, unknown>).hooks).toEqual({
      Stop: [{ hooks: [{ name: "new", command: "echo new", timeout: 10 }] }],
    })

    // global 已失效（新会话首发用新配置），运行中会话缓存保持旧配置（无热重载）。
    expect(hookConfig.get("global")[0]?.name).toBe("new")
    expect(hookConfig.get("sess-1")[0]?.name).toBe("old")
  })

  it("非法条目拒绝写入并抛出，配置文件保持不变", () => {
    writeConfig({
      agent: { hooks: { Stop: [{ hooks: [{ name: "keep", command: "echo keep" }] }] } },
    })
    const before = readFileSync(holder.configPath, "utf8")

    expect(() =>
      saveHookSettings({
        Stop: [{ hooks: [{ name: "broken", command: "   " }] }],
      }),
    ).toThrow()
    expect(readFileSync(holder.configPath, "utf8")).toBe(before)
  })

  it("规范 matcher 并拒绝含空段的 matcher", () => {
    writeConfig({})
    const saved = saveHookSettings({
      PreToolUse: [{ matcher: " bash | edit ", hooks: [{ name: "gate", command: "exit 0" }] }],
    })
    expect(saved.PreToolUse?.[0]?.matcher).toBe("bash|edit")

    expect(() =>
      saveHookSettings({
        PreToolUse: [{ matcher: "bash||edit", hooks: [{ name: "gate", command: "exit 0" }] }],
      }),
    ).toThrow()
  })
})
