import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  APP_DISPLAY_NAME,
  composeWindowTitle,
  type DevEnvInfo,
  formatDevEnvLabel,
  resolveDevEnvLabel,
} from "@/lib/devEnvLabel"

// 构造探测事实：默认值模拟链接工作区（.worktrees 下的 worktree）。
const env = (overrides: Partial<DevEnvInfo> = {}): DevEnvInfo => ({
  branch: "feat/foo",
  worktreeName: "foo",
  isLinkedWorktree: true,
  ...overrides,
})

describe("formatDevEnvLabel", () => {
  it("工作区名与分支名尾段重复时去重，仅显示分支", () => {
    expect(
      formatDevEnvLabel(
        env({ branch: "feat/file-changes-summary", worktreeName: "file-changes-summary" }),
      ),
    ).toBe("feat/file-changes-summary")
    expect(formatDevEnvLabel(env({ branch: "foo", worktreeName: "foo" }))).toBe("foo")
  })

  it("链接工作区且名称独立时拼接 分支-工作区", () => {
    expect(formatDevEnvLabel(env({ branch: "feat/foo", worktreeName: "bar" }))).toBe("feat/foo-bar")
  })

  it("主仓库仅显示分支名", () => {
    expect(
      formatDevEnvLabel(env({ branch: "dev", worktreeName: "lx-agent", isLinkedWorktree: false })),
    ).toBe("dev")
  })

  it("detached HEAD 使用短 SHA", () => {
    expect(formatDevEnvLabel(env({ branch: "HEAD", detachedSha: "a1b2c3d" }))).toBe("a1b2c3d")
  })

  it("缺少有效分支信息时返回 null", () => {
    expect(formatDevEnvLabel(env({ branch: "HEAD" }))).toBeNull()
    expect(formatDevEnvLabel(env({ branch: "   " }))).toBeNull()
  })
})

describe("composeWindowTitle", () => {
  it("有环境标签时以 · 追加", () => {
    expect(composeWindowTitle("LX Agent", "feat/foo")).toBe("LX Agent · feat/foo")
  })

  it("无标签时原样返回页面标题", () => {
    expect(composeWindowTitle("LX Agent", null)).toBe("LX Agent")
  })

  it("页面标题为空时回退产品名，并裁剪标题空白", () => {
    expect(composeWindowTitle("   ", "feat/foo")).toBe(`${APP_DISPLAY_NAME} · feat/foo`)
    expect(composeWindowTitle("  LX Agent  ", "feat/foo")).toBe("LX Agent · feat/foo")
  })
})

describe("resolveDevEnvLabel", () => {
  it("当前仓库返回非空标签（git 探测链路可用）", () => {
    expect(resolveDevEnvLabel(process.cwd())).toBeTruthy()
  })

  it("非 git 目录返回 null，不追加后缀", () => {
    const dir = mkdtempSync(join(tmpdir(), "lx-dev-env-label-"))
    expect(resolveDevEnvLabel(dir)).toBeNull()
  })
})
