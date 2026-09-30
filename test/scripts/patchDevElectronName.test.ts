import { describe, expect, it } from "vitest"
import {
  computeDevAppName,
  formatDevEnvLabel,
  resolveInfoPlistPath,
} from "../../scripts/patchDevElectronName.mjs"

// 脚本侧标签规则必须与 src/main/lib/devEnvLabel.ts 一致（同一组固定用例）。
describe("formatDevEnvLabel（脚本侧与 main 同规则）", () => {
  const env = (overrides = {}) => ({
    branch: "feat/foo",
    worktreeName: "foo",
    isLinkedWorktree: true,
    ...overrides,
  })

  it("工作区名与分支名尾段重复时去重，仅显示分支", () => {
    expect(
      formatDevEnvLabel(
        env({ branch: "feat/file-changes-summary", worktreeName: "file-changes-summary" }),
      ),
    ).toBe("feat/file-changes-summary")
  })

  it("链接工作区且名称独立时拼接 分支-工作区", () => {
    expect(formatDevEnvLabel(env({ worktreeName: "bar" }))).toBe("feat/foo-bar")
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
  })
})

describe("computeDevAppName", () => {
  it("有标签时追加 ` · <标签>`", () => {
    expect(computeDevAppName("LX Agent", "feat/foo")).toBe("LX Agent · feat/foo")
  })

  it("无标签时保持产品名", () => {
    expect(computeDevAppName("LX Agent", null)).toBe("LX Agent")
  })
})

describe("resolveInfoPlistPath", () => {
  it("由可执行文件路径推导 bundle 内 Info.plist", () => {
    expect(
      resolveInfoPlistPath("/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"),
    ).toBe("/repo/node_modules/electron/dist/Electron.app/Contents/Info.plist")
  })
})
