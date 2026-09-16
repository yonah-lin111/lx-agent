import { beforeEach, describe, expect, it, vi } from "vitest"

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }))

vi.mock("electron", () => ({ shell: { openExternal } }))

import { isExternalHttpUrl, openExternalUrl } from "@/services/externalLinkService"

describe("externalLinkService", () => {
  beforeEach(() => {
    openExternal.mockReset()
  })

  it("isExternalHttpUrl 仅放行 http/https", () => {
    expect(isExternalHttpUrl("https://example.com/a?b=1")).toBe(true)
    expect(isExternalHttpUrl("http://localhost:3000")).toBe(true)
    expect(isExternalHttpUrl("HTTPS://EXAMPLE.COM")).toBe(true)
    expect(isExternalHttpUrl("file:///etc/passwd")).toBe(false)
    expect(isExternalHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isExternalHttpUrl("about:blank")).toBe(false)
    expect(isExternalHttpUrl("not a url")).toBe(false)
    expect(isExternalHttpUrl("")).toBe(false)
  })

  it("openExternalUrl 用系统浏览器打开合法链接", async () => {
    openExternal.mockResolvedValue(undefined)

    await openExternalUrl("https://github.com/upstash/context7")

    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith("https://github.com/upstash/context7")
  })

  it("openExternalUrl 忽略非 http/https 链接", async () => {
    await openExternalUrl("file:///etc/passwd")
    await openExternalUrl("mailto:someone@example.com")

    expect(openExternal).not.toHaveBeenCalled()
  })

  it("openExternalUrl 吞掉打开失败并记录日志", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    openExternal.mockRejectedValue(new Error("no browser"))

    await expect(openExternalUrl("https://example.com")).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
