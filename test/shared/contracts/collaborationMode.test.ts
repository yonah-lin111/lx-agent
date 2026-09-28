import {
  COLLABORATION_MODE_ORDER,
  getModeAllowedTools,
  getModeBlockedTools,
  isToolBlockedByMode,
  nextCollaborationMode,
  normalizeCollaborationMode,
  roleBlockedTools,
  SWITCH_MODE_TARGETS,
  withModePermissionDefaults,
} from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"

describe("协作模式契约", () => {
  it("模式顺序与循环切换：build → auto → plan → review → minimal → build", () => {
    expect(COLLABORATION_MODE_ORDER).toEqual(["build", "auto", "plan", "review", "minimal"])
    expect(nextCollaborationMode("build")).toBe("auto")
    expect(nextCollaborationMode("auto")).toBe("plan")
    expect(nextCollaborationMode("plan")).toBe("review")
    expect(nextCollaborationMode("review")).toBe("minimal")
    expect(nextCollaborationMode("minimal")).toBe("build")
  })

  it("design 已移除：不在顺序 / 切换目标集合中，历史值与非法值一样回退 build", () => {
    expect(COLLABORATION_MODE_ORDER as readonly string[]).not.toContain("design")
    expect(SWITCH_MODE_TARGETS as readonly string[]).not.toContain("design")
    expect(normalizeCollaborationMode("design")).toBe("build")
  })

  it("switch_mode 目标集合：minimal / auto 不可达", () => {
    expect(SWITCH_MODE_TARGETS).toEqual(["build", "plan", "review"])
  })

  it("归一化：合法模式保留（含 auto / minimal），历史 default 与非法值回退 build", () => {
    for (const mode of COLLABORATION_MODE_ORDER) {
      expect(normalizeCollaborationMode(mode)).toBe(mode)
    }
    expect(normalizeCollaborationMode("default")).toBe("build")
    expect(normalizeCollaborationMode("bogus")).toBe("build")
    expect(normalizeCollaborationMode(undefined)).toBe("build")
    expect(normalizeCollaborationMode(null)).toBe("build")
  })

  it("Minimal 白名单：bash 与 read/write/edit 放行，其余工具 fail-closed 拦截", () => {
    expect(getModeAllowedTools("minimal")).toEqual(new Set(["bash", "read", "write", "edit"]))
    expect(getModeAllowedTools("build")).toBeUndefined()

    for (const toolName of ["bash", "read", "write", "edit"]) {
      expect(isToolBlockedByMode("minimal", toolName)).toBe(false)
    }

    for (const toolName of [
      "ls",
      "grep",
      "find",
      "apply_patch",
      "task",
      "question",
      "todowrite",
      "memory",
      "wireframe",
      "web_search",
      "webfetch",
      "read_skill",
      "lsp",
      "view_image",
      "job_output",
      "future_tool",
      "mcp__server__tool",
    ]) {
      expect(isToolBlockedByMode("minimal", toolName)).toBe(true)
    }
  })

  it("黑名单模式保持原语义：build / auto 不拦截，plan/review 拦写操作，plan 另拦 question", () => {
    expect(isToolBlockedByMode("auto", "write")).toBe(false)
    expect([...getModeBlockedTools("auto")]).toEqual([])
    expect(isToolBlockedByMode("build", "write")).toBe(false)
    expect([...getModeBlockedTools("plan")].sort()).toEqual([
      "apply_patch",
      "edit",
      "memory",
      "question",
      "todowrite",
      "write",
    ])
    expect(isToolBlockedByMode("review", "todowrite")).toBe(true)
    // question 仅被 plan 硬拦截：review 不受影响；wireframe 不再有模式硬基线。
    expect(isToolBlockedByMode("plan", "question")).toBe(true)
    expect(isToolBlockedByMode("review", "question")).toBe(false)
    expect(isToolBlockedByMode("plan", "wireframe")).toBe(false)
    expect(isToolBlockedByMode("review", "wireframe")).toBe(false)
    expect(isToolBlockedByMode("plan", "read")).toBe(false)
  })

  it("角色兼容：Minimal 下白名单外工具的角色永久禁用，纯白名单能力集角色可用", () => {
    const blocked = roleBlockedTools(undefined, "minimal")
    expect(blocked).toContain("ls")
    expect(blocked).toContain("grep")
    expect(blocked).not.toContain("read")
    expect(blocked).not.toContain("write")
    expect(roleBlockedTools({ tools: ["bash", "read", "write", "edit"] }, "minimal")).toEqual([])
    expect(roleBlockedTools({ tools: ["read", "bash"] }, "minimal")).toEqual([])
    expect(roleBlockedTools({ tools: ["read", "grep"] }, "minimal")).toEqual(["grep"])
    expect(roleBlockedTools({ tools: ["read"] }, "build")).toEqual([])
  })

  it("Minimal 无子代理缺省：能力权限缺省不注入 subagents", () => {
    expect(withModePermissionDefaults("minimal", undefined)).toBeUndefined()
    expect(withModePermissionDefaults("plan", undefined)).toEqual({ subagents: ["explorer"] })
    // auto 与 build 同级：缺省不注入子代理白名单。
    expect(withModePermissionDefaults("auto", undefined)).toBeUndefined()
    expect(roleBlockedTools(undefined, "auto")).toEqual([])
  })
})
