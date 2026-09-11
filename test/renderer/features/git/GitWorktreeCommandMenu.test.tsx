// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GitWorktreeOption } from "@/features/git"
import { GitWorktreeCommandMenu } from "@/features/git"
import * as i18nModule from "@/i18n"

const mockOptions: GitWorktreeOption[] = [
  {
    name: "main",
    path: "/test/repo",
    branch: "main",
    isDefault: true,
    isCurrent: true,
  },
  {
    name: "feature-1",
    path: "/test/repo/.worktrees/feature-1",
    branch: "feature-1",
    isDefault: false,
    isCurrent: false,
  },
]

describe("GitWorktreeCommandMenu 国际化与渲染逻辑", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it("默认英文环境下正确渲染 i18n 文本 (aria-label, Default worktree, Current)", () => {
    render(
      <GitWorktreeCommandMenu
        visible={true}
        options={mockOptions}
        activeIndex={0}
        position={{ top: 10, left: 10 }}
      />,
    )

    const menu = screen.getByRole("listbox", { name: "Select Git worktree" })
    expect(menu).not.toBeNull()

    // 默认工作区显示英文
    expect(screen.getByText("Default worktree")).not.toBeNull()
    // 当前工作区显示英文 Current
    expect(screen.getByText("Current")).not.toBeNull()
    // 普通工作区显示路径
    expect(screen.getByText("/test/repo/.worktrees/feature-1")).not.toBeNull()
  })

  it("中文环境下正确渲染 i18n 文本 (aria-label, 默认工作区, 当前)", () => {
    vi.spyOn(i18nModule, "useTranslation").mockReturnValue({
      locale: "zh",
      setLocale: vi.fn(),
      t: (key: string) => {
        const dict: Record<string, string> = {
          "git.selectWorktree": "git 工作区选择",
          "git.defaultWorktree": "默认工作区",
          "git.current": "当前",
        }
        return dict[key] ?? key
      },
    })

    render(
      <GitWorktreeCommandMenu
        visible={true}
        options={mockOptions}
        activeIndex={0}
        position={{ top: 10, left: 10 }}
      />,
    )

    const menu = screen.getByRole("listbox", { name: "git 工作区选择" })
    expect(menu).not.toBeNull()

    // 默认工作区显示中文
    expect(screen.getByText("默认工作区")).not.toBeNull()
    // 当前工作区显示中文 当前
    expect(screen.getByText("当前")).not.toBeNull()
  })

  it("点选工作区项触发 onSelect，且悬停不改变键盘激活项", () => {
    const onSelect = vi.fn()
    render(
      <GitWorktreeCommandMenu
        visible={true}
        options={mockOptions}
        activeIndex={0}
        position={{ top: 10, left: 10 }}
        onSelect={onSelect}
      />,
    )

    const options = screen.getAllByRole("option")
    fireEvent.mouseEnter(options[1])
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(options[1].getAttribute("aria-selected")).toBe("false")

    fireEvent.mouseDown(options[1])
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(mockOptions[1])
  })

  it("当 visible 为 false 且无缓存时，不渲染任何节点", () => {
    const { container } = render(
      <GitWorktreeCommandMenu
        visible={false}
        options={mockOptions}
        activeIndex={0}
        position={{ top: 10, left: 10 }}
      />,
    )

    expect(container.firstChild).toBeNull()
  })
})
