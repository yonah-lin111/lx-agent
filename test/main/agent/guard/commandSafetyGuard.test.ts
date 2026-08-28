import type { PermissionSettings } from "@shared/contracts/agent"
import { describe, expect, it, vi } from "vitest"
import { evaluateCommandSafety, unwrapCommand } from "@/agent/guard/commandSafetyGuard"

const holder = vi.hoisted(() => ({
  permissionSettings: {
    defaultMode: "default",
    allow: [],
    deny: [],
    ask: [],
  } as PermissionSettings,
}))

vi.mock("@/services/settingsService", () => ({
  getPermissionSettings: () => holder.permissionSettings,
  savePermissionSettings: (input: PermissionSettings) => {
    holder.permissionSettings = input
    return input
  },
}))

import { permissionManager } from "@/agent/permissions/permissionManager"

describe("CommandSafetyGuard", () => {
  it("正确拆解 shell 封装层 (sudo, env, sh -c)", () => {
    expect(unwrapCommand("sudo rm -rf /")).toBe("rm -rf /")
    expect(unwrapCommand("env FOO=bar sudo sh -c 'git reset --hard'")).toBe("git reset --hard")
    expect(unwrapCommand("bash -c \"zsh -c 'git clean -fd'\"")).toBe("git clean -fd")
  })

  it("精准识别绝对破坏性危险指令 (dangerous -> deny)", () => {
    expect(evaluateCommandSafety("rm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("sudo rm -rf ~").level).toBe("dangerous")
    expect(evaluateCommandSafety("git reset --hard").level).toBe("dangerous")
    expect(evaluateCommandSafety("git clean -fdx").level).toBe("dangerous")
    expect(evaluateCommandSafety("mkfs.ext4 /dev/sda1").level).toBe("dangerous")
  })

  it("精准识别敏感需确认指令 (sensitive -> ask)", () => {
    expect(evaluateCommandSafety("git push --force origin main").level).toBe("sensitive")
    expect(evaluateCommandSafety("git checkout -- .").level).toBe("sensitive")
    expect(evaluateCommandSafety("chmod -R 777 /app").level).toBe("sensitive")
    expect(evaluateCommandSafety("reboot").level).toBe("sensitive")
  })

  it("安全指令正常放行 (safe)", () => {
    expect(evaluateCommandSafety("git status").level).toBe("safe")
    expect(evaluateCommandSafety("npm test").level).toBe("safe")
    expect(evaluateCommandSafety("pnpm build").level).toBe("safe")
  })

  it("PermissionManager 集成 CommandSafetyGuard 正确判定", () => {
    holder.permissionSettings = {
      defaultMode: "default",
      allow: ["Bash(git push --force*)"],
      deny: [],
      ask: [],
    }
    permissionManager.load()

    // 危险指令直接 deny
    expect(permissionManager.evaluate("bash", { command: "rm -rf /" })).toBe("deny")
    expect(permissionManager.evaluate("bash", { command: "git reset --hard HEAD~1" })).toBe("deny")

    // 敏感指令即使在 allow 规则中也提升为 ask
    expect(permissionManager.evaluate("bash", { command: "git push --force origin main" })).toBe(
      "ask",
    )
  })
})
