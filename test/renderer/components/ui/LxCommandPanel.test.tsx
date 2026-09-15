// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"

describe("LxCommandPanel", () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("关闭后 120ms 内保留最后数据渲染，随后卸载", () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <LxCommandPanel
        visible={true}
        data={{ position: { top: 1, left: 2 }, activeIndex: 0, items: ["alpha"] }}
        ariaLabel="命令面板"
        className="panel-class"
      >
        {(data) =>
          data.items.map((item, index) => (
            <LxCommandPanelItem key={item} index={index} active={index === data.activeIndex}>
              {item}
            </LxCommandPanelItem>
          ))
        }
      </LxCommandPanel>,
    )

    expect(screen.getByRole("option", { name: "alpha" })).toBeDefined()

    // 关闭时传入新数据：退场期间必须继续渲染冻结的旧数据。
    rerender(
      <LxCommandPanel
        visible={false}
        data={{ position: { top: 9, left: 9 }, activeIndex: 0, items: ["beta"] }}
        ariaLabel="命令面板"
        className="panel-class"
      >
        {(data) =>
          data.items.map((item, index) => (
            <LxCommandPanelItem key={item} index={index} active={index === data.activeIndex}>
              {item}
            </LxCommandPanelItem>
          ))
        }
      </LxCommandPanel>,
    )

    expect(screen.getByRole("option", { name: "alpha" })).toBeDefined()
    expect(screen.queryByText("beta")).toBeNull()

    act(() => {
      vi.advanceTimersByTime(119)
    })
    expect(screen.queryByRole("option")).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(container.firstChild).toBeNull()
  })

  it("退场动画结束后触发 onExited", () => {
    vi.useFakeTimers()
    const onExited = vi.fn()
    const { rerender } = render(
      <LxCommandPanel
        visible={true}
        data={{ position: { top: 0, left: 0 }, activeIndex: 0 }}
        ariaLabel="命令面板"
        className="panel-class"
        onExited={onExited}
      >
        {() => null}
      </LxCommandPanel>,
    )

    rerender(
      <LxCommandPanel
        visible={false}
        data={null}
        ariaLabel="命令面板"
        className="panel-class"
        onExited={onExited}
      >
        {() => null}
      </LxCommandPanel>,
    )

    expect(onExited).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it("无数据且从未打开时不渲染", () => {
    const { container } = render(
      <LxCommandPanel visible={true} data={null} ariaLabel="命令面板" className="panel-class">
        {() => null}
      </LxCommandPanel>,
    )

    expect(container.firstChild).toBeNull()
  })

  it("选项行渲染 aria 状态、data-index 和 leading 槽，点选回传回调", () => {
    const onSelect = vi.fn()
    render(
      <LxCommandPanel
        visible={true}
        data={{ position: { top: 0, left: 0 }, activeIndex: 1 }}
        ariaLabel="命令面板"
        className="panel-class"
      >
        {() => (
          <>
            <LxCommandPanelItem index={0} active={false} leading={<span data-testid="leading" />}>
              first
            </LxCommandPanelItem>
            <LxCommandPanelItem
              index={1}
              active={true}
              activeClassName="bg-red-500/20 text-red-200"
              onSelect={onSelect}
            >
              second
            </LxCommandPanelItem>
          </>
        )}
      </LxCommandPanel>,
    )

    const options = screen.getAllByRole("option")
    expect(options[0].getAttribute("data-index")).toBe("0")
    expect(options[0].getAttribute("aria-selected")).toBe("false")
    expect(options[1].getAttribute("data-index")).toBe("1")
    expect(options[1].getAttribute("aria-selected")).toBe("true")
    expect(options[1].className).toContain("bg-red-500/20")
    expect(screen.getByTestId("leading")).toBeDefined()

    // mouseDown 已被 preventDefault（返回 false 表示默认行为被阻止）。
    expect(fireEvent.mouseDown(options[1])).toBe(false)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
