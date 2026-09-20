// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GitHubRepoTag } from "@/features/app-index/components/GitHubRepoTag"
import { formatStarCount } from "@/features/app-index/utils"

const REPO_URL = "https://github.com/yonah-lin111/lx-agent"

describe("formatStarCount", () => {
  it("按 GitHub 风格截断为紧凑文本", () => {
    expect(formatStarCount(999)).toBe("999")
    expect(formatStarCount(1000)).toBe("1k")
    expect(formatStarCount(1234)).toBe("1.2k")
    expect(formatStarCount(12345)).toBe("12.3k")
    expect(formatStarCount(123456)).toBe("123k")
  })
})

describe("GitHubRepoTag", () => {
  let getStars: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getStars = vi.fn().mockResolvedValue({ stars: 1234 })
    // @ts-expect-error Mock window.api
    window.api = { github: { getStars } }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("星数就绪后展示星标 icon 与紧凑数字，链接指向仓库", async () => {
    render(<GitHubRepoTag />)

    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe(REPO_URL)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noreferrer")
    await waitFor(() => {
      expect(link.textContent).toBe("GitHub1.2k")
    })
    expect(link.querySelector("svg")).not.toBeNull()
    expect(getStars).toHaveBeenCalledTimes(1)
  })

  it("悬停时 tooltip 展示完整星数", async () => {
    render(<GitHubRepoTag />)
    const link = screen.getByRole("link")
    await waitFor(() => {
      expect(link.textContent).toBe("GitHub1.2k")
    })

    fireEvent.mouseEnter(link)

    await waitFor(() => {
      expect(screen.getByText("View source on GitHub · 1,234 stars")).toBeDefined()
    })
  })

  it("尚未取得星数时仅展示 GitHub 入口", async () => {
    getStars.mockResolvedValue({ stars: null })
    render(<GitHubRepoTag />)

    await waitFor(() => {
      expect(getStars).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole("link").textContent).toBe("GitHub")
  })

  it("IPC 异常时静默降级为无星数", async () => {
    getStars.mockRejectedValue(new Error("ipc broken"))
    render(<GitHubRepoTag />)

    await waitFor(() => {
      expect(getStars).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole("link").textContent).toBe("GitHub")
  })
})
