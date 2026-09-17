import { describe, expect, it } from "vitest"
import { resolveNextVersion } from "../../scripts/release.mjs"

describe("resolveNextVersion", () => {
  it("按级别递增并清零低位", () => {
    expect(resolveNextVersion("1.2.3", "major")).toBe("2.0.0")
    expect(resolveNextVersion("1.2.3", "minor")).toBe("1.3.0")
    expect(resolveNextVersion("1.2.3", "patch")).toBe("1.2.4")
  })

  it("支持显式版本号并容忍 v 前缀", () => {
    expect(resolveNextVersion("1.2.3", "2.0.0")).toBe("2.0.0")
    expect(resolveNextVersion("1.2.3", "v2.1.0")).toBe("2.1.0")
    expect(resolveNextVersion("1.2.3", "2.0.0-beta.1")).toBe("2.0.0-beta.1")
  })

  it("当前版本与显式目标相同时拒绝", () => {
    expect(resolveNextVersion("1.2.3", "1.2.3")).toBeNull()
    expect(resolveNextVersion("1.2.3", "v1.2.3")).toBeNull()
  })

  it("非法输入返回 null", () => {
    expect(resolveNextVersion("1.2.3", "")).toBeNull()
    expect(resolveNextVersion("1.2.3", undefined)).toBeNull()
    expect(resolveNextVersion("1.2.3", "latest")).toBeNull()
    expect(resolveNextVersion("1.2.3", "1.2")).toBeNull()
    expect(resolveNextVersion("not-a-version", "patch")).toBeNull()
  })
})
