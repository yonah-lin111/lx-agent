// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import { OfficeScene } from "@/features/openclaw/office/officeScene"

// PixiJS 依赖 WebGL，jsdom 下无法真实渲染；此处以最小桩验证场景装配与生命周期不报错。
vi.mock("pixi.js/unsafe-eval", () => ({}))

vi.mock("pixi.js", () => {
  class MockContainer {
    children: unknown[] = []
    position = { set: vi.fn() }
    scale = { set: vi.fn() }
    eventMode = ""
    cursor = ""
    hitArea: unknown = null
    addChild(...children: unknown[]): this {
      this.children.push(...children)
      return this
    }
    removeChildren(): unknown[] {
      const removed = this.children
      this.children = []
      return removed
    }
    on = vi.fn()
    destroy = vi.fn()
  }
  class MockGraphics {
    rect(): this {
      return this
    }
    fill(): this {
      return this
    }
    circle(): this {
      return this
    }
    roundRect(): this {
      return this
    }
    stroke(): this {
      return this
    }
    clear(): this {
      return this
    }
  }
  class MockText {
    anchor = { set: vi.fn() }
    position = { set: vi.fn() }
    resolution = 1
    constructor(_options: unknown) {}
  }
  class MockRectangle {}
  class MockApplication {
    stage = new MockContainer()
    canvas = document.createElement("canvas")
    renderer = { width: 800, height: 600, resize: vi.fn() }
    ticker = { add: vi.fn() }
    init = vi.fn(async () => {})
    destroy = vi.fn()
  }
  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
    Rectangle: MockRectangle,
  }
})

const agents = [
  { agentId: "lily", name: "Lily", accent: 0xff6b6b },
  { agentId: "amy", name: "Amy", accent: 0x6bcf7f },
]

describe("OfficeScene (Pixi smoke)", () => {
  it("可创建场景并挂载画布", async () => {
    const scene = await OfficeScene.create({
      agents,
      statuses: { lily: "working", amy: "idle" },
      selectedAgentIds: ["lily"],
      onSelectAgent: vi.fn(),
    })

    expect(scene.canvas).toBeInstanceOf(HTMLCanvasElement)

    scene.destroy()
  })

  it("更新员工、状态、选中与尺寸不抛错", async () => {
    const scene = await OfficeScene.create({
      agents,
      statuses: {},
      selectedAgentIds: [],
      onSelectAgent: vi.fn(),
    })

    expect(() => {
      scene.setAgents(agents)
      scene.setStatuses({ lily: "error", amy: "connecting" })
      scene.setSelection(["amy"])
      scene.resize(640, 480)
    }).not.toThrow()

    scene.destroy()
  })
})
