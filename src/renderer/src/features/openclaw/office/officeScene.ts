import { Application, Container, Graphics, Rectangle, Text } from "pixi.js"
import "pixi.js/unsafe-eval"
import type { OfficeAgentStatus } from "../agentStatus"
import { computeOfficeLayout, type OfficeLayout } from "./officeLayout"

// 办公室场景配色（程序化像素风，不依赖外部瓦片资源）。
const COLORS = {
  backdrop: 0x17171c,
  floorA: 0x2c2c34,
  floorB: 0x26262d,
  wall: 0x1c1c22,
  wallTop: 0x3a3a45,
  rug: 0x33333d,
  desk: 0x6f4b2e,
  deskTop: 0x8a6440,
  monitorFrame: 0x10141b,
  monitorOn: 0x4ecdc4,
  chair: 0x3d3d47,
  skin: 0xf2c9a0,
  ink: 0x1a1320,
  selection: 0xffd93d,
  error: 0xff6b6b,
  warn: 0xffd93d,
  ok: 0x6bcf7f,
} as const

// 每个逻辑像素在画布上的放大量，制造清晰的像素块观感。
const PIXEL_SCALE = 3

const STATUS_GLYPH_COLOR: Record<OfficeAgentStatus, number | undefined> = {
  working: COLORS.ok,
  connecting: COLORS.warn,
  blocked: COLORS.warn,
  error: COLORS.error,
  idle: undefined,
  offline: undefined,
}

export interface OfficeSceneAgent {
  agentId: string
  name: string
  accent: number
}

interface AgentVisual {
  container: Container
  body: Graphics
  glyph: Graphics
  ring: Graphics
  accent: number
  status: OfficeAgentStatus
  selected: boolean
}

export interface OfficeSceneOptions {
  agents: OfficeSceneAgent[]
  statuses: Record<string, OfficeAgentStatus>
  selectedAgentIds: string[]
  // additive = 按住 Ctrl/Cmd 追加/移除选中（多选扇出）。
  onSelectAgent: (agentId: string, additive: boolean) => void
}

/**
 * 程序化绘制的像素办公室场景（PixiJS）。
 *
 * 房间、工位与员工角色全部由代码绘制，无外部图片资源；员工状态由会话快照驱动，
 * 点击角色可选中（多选由调用方根据 modifier 决定）。员工数量变化时重建布局与角色。
 */
export class OfficeScene {
  private readonly app: Application
  private readonly world: Container
  private readonly room: Container
  private layout: OfficeLayout
  private visuals = new Map<string, AgentVisual>()
  private elapsed = 0
  private readonly onSelectAgent: (agentId: string, additive: boolean) => void

  private constructor(app: Application, options: OfficeSceneOptions) {
    this.app = app
    this.onSelectAgent = options.onSelectAgent
    this.layout = computeOfficeLayout(options.agents.length)
    this.world = new Container()
    this.room = new Container()
    this.world.addChild(this.room)
    this.app.stage.addChild(this.world)
    // setAgents 会依据员工数重算布局并重建房间与角色。
    this.setAgents(options.agents)
    this.setStatuses(options.statuses)
    this.setSelection(options.selectedAgentIds)
    this.fit()
  }

  /**
   * 创建并初始化场景（异步创建 Pixi Application）。
   */
  static async create(options: OfficeSceneOptions): Promise<OfficeScene> {
    const app = new Application()
    await app.init({
      background: COLORS.backdrop,
      antialias: false,
      roundPixels: true,
      autoDensity: true,
      resolution: Math.max(window.devicePixelRatio || 1, 2),
    })
    app.stage.eventMode = "static"
    const scene = new OfficeScene(app, options)
    app.ticker.add((ticker) => {
      scene.elapsed += ticker.deltaMS / 1000
      scene.animate()
    })
    return scene
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas as HTMLCanvasElement
  }

  /**
   * 更新员工集合：员工数变化时重算布局并重建房间与角色。
   */
  setAgents(agents: OfficeSceneAgent[]): void {
    this.layout = computeOfficeLayout(agents.length)
    this.rebuildRoom()

    for (const visual of this.visuals.values()) {
      visual.container.destroy({ children: true })
    }
    this.visuals.clear()

    agents.forEach((agent, index) => {
      const desk = this.layout.desks[index]
      if (!desk) return
      const container = new Container()
      const ring = new Graphics()
      const body = new Graphics()
      const glyph = new Graphics()
      container.addChild(ring, body, glyph)

      container.position.set(desk.seat.x * this.layout.tileSize, desk.seat.y * this.layout.tileSize)
      container.eventMode = "static"
      container.cursor = "pointer"
      container.hitArea = new Rectangle(-12, -26, 24, 34)
      container.on("pointertap", (event) => {
        event.stopPropagation()
        const native = event.nativeEvent as PointerEvent | MouseEvent | undefined
        this.onSelectAgent(agent.agentId, Boolean(native?.ctrlKey || native?.metaKey))
      })

      this.world.addChild(container)
      this.visuals.set(agent.agentId, {
        container,
        body,
        glyph,
        ring,
        accent: agent.accent,
        status: "idle",
        selected: false,
      })
      this.drawNameTag(container, agent.name, agent.accent)
    })

    this.redrawAll()
    this.fit()
  }

  /**
   * 更新员工状态（驱动动画与状态符号）。
   */
  setStatuses(statuses: Record<string, OfficeAgentStatus>): void {
    for (const [agentId, visual] of this.visuals) {
      visual.status = statuses[agentId] ?? "idle"
    }
    this.redrawAll()
  }

  /**
   * 更新选中集合（高亮环）。
   */
  setSelection(selectedAgentIds: readonly string[]): void {
    const selected = new Set(selectedAgentIds)
    for (const [agentId, visual] of this.visuals) {
      visual.selected = selected.has(agentId)
    }
    this.redrawAll()
  }

  /**
   * 画布尺寸变化时重新适配。
   */
  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height)
    this.fit()
  }

  destroy(): void {
    this.app.destroy(true, { children: true })
  }

  // 重建房间地板、墙体与工位家具。
  private rebuildRoom(): void {
    this.room.removeChildren()
    const { widthTiles, heightTiles, tileSize, entrance } = this.layout
    const floor = new Graphics()
    for (let y = 0; y < heightTiles; y += 1) {
      for (let x = 0; x < widthTiles; x += 1) {
        const isWall = x < 1 || y < 1 || x >= widthTiles - 1 || y >= heightTiles - 1
        const isDoor = y >= heightTiles - 1 && x >= entrance.x - 1 && x <= entrance.x
        if (isWall && !isDoor) {
          floor
            .rect(x * tileSize, y * tileSize, tileSize, tileSize)
            .fill(y < 1 ? COLORS.wallTop : COLORS.wall)
        } else {
          floor
            .rect(x * tileSize, y * tileSize, tileSize, tileSize)
            .fill((x + y) % 2 === 0 ? COLORS.floorA : COLORS.floorB)
        }
      }
    }
    this.room.addChild(floor)

    for (const desk of this.layout.desks) {
      const furniture = new Graphics()
      const px = desk.cell.x * tileSize
      const py = desk.cell.y * tileSize
      // 工位地毯
      furniture.rect(px, py, tileSize * 4, tileSize * 2).fill(COLORS.rug)
      // 桌面与桌沿
      furniture.rect(px + tileSize, py + tileSize, tileSize * 2, tileSize).fill(COLORS.desk)
      furniture
        .rect(px + tileSize, py + tileSize, tileSize * 2, Math.max(2, tileSize / 4))
        .fill(COLORS.deskTop)
      // 显示器与屏幕
      furniture
        .rect(px + tileSize * 1.25, py + tileSize * 0.5, tileSize, tileSize * 0.75)
        .fill(COLORS.monitorFrame)
      furniture
        .rect(px + tileSize * 1.35, py + tileSize * 0.58, tileSize * 0.8, tileSize * 0.5)
        .fill(COLORS.monitorOn)
      // 椅子
      furniture
        .rect(px + tileSize * 0.25, py + tileSize * 1.75, tileSize * 0.75, tileSize * 0.6)
        .fill(COLORS.chair)
      this.room.addChild(furniture)
    }
  }

  // 绘制员工姓名牌（位于角色上方）。
  private drawNameTag(container: Container, name: string, accent: number): void {
    const tag = new Graphics()
    tag.roundRect(-18, -34, 36, 10, 3).fill(COLORS.ink).stroke({ width: 1, color: accent })
    container.addChild(tag)

    const label = new Text({
      text: name.length > 10 ? `${name.slice(0, 9)}…` : name,
      style: { fontFamily: "monospace", fontSize: 7, fill: 0xffffff },
    })
    label.anchor.set(0.5)
    label.position.set(0, -29)
    label.resolution = 4
    container.addChild(label)
  }

  // 重绘全部角色（状态/选中变化时调用）。
  private redrawAll(): void {
    for (const visual of this.visuals.values()) {
      this.drawCharacter(visual)
    }
  }

  private drawCharacter(visual: AgentVisual): void {
    const g = visual.body
    g.clear()
    g.rect(-4, -6, 2, 4).fill(COLORS.ink)
    g.rect(2, -6, 2, 4).fill(COLORS.ink)
    g.rect(-5, -13, 10, 8).fill(visual.accent)
    g.rect(-4, -20, 8, 8).fill(COLORS.skin)
    g.rect(-4, -21, 8, 3).fill(visual.accent)
    g.rect(-2, -18, 1.5, 1.5).fill(COLORS.ink)
    g.rect(1, -18, 1.5, 1.5).fill(COLORS.ink)
    const working = visual.status === "working" || visual.status === "connecting"
    if (working) {
      // 忙碌时抬起双手（打字）。
      g.rect(-6, -12, 2, 3).fill(COLORS.skin)
      g.rect(4, -12, 2, 3).fill(COLORS.skin)
    }

    visual.ring.clear()
    if (visual.selected) {
      visual.ring.circle(0, -10, 16).stroke({ width: 2, color: COLORS.selection })
    }

    visual.glyph.clear()
    const glyphColor = STATUS_GLYPH_COLOR[visual.status]
    if (glyphColor !== undefined) {
      visual.glyph.circle(0, -30, 4).fill(glyphColor)
      visual.glyph.rect(-0.75, -32, 1.5, 3).fill(COLORS.ink)
      visual.glyph.circle(0, -30.5, 0.6).fill(COLORS.ink)
    }
  }

  // 每帧动画：待机呼吸与工作敲击。
  private animate(): void {
    let index = 0
    for (const visual of this.visuals.values()) {
      const desk = this.layout.desks[index]
      index += 1
      if (!desk) continue
      const baseY = desk.seat.y * this.layout.tileSize
      const isActive = visual.status === "working" || visual.status === "connecting"
      const bob = isActive
        ? Math.sin(this.elapsed * 6 + index) * 0.6
        : Math.sin(this.elapsed * 2 + index) * 0.35
      visual.container.y = baseY + bob
    }
  }

  // 让整个办公室适配画布并居中。
  private fit(): void {
    const { widthTiles, heightTiles, tileSize } = this.layout
    const worldWidth = widthTiles * tileSize * PIXEL_SCALE
    const worldHeight = heightTiles * tileSize * PIXEL_SCALE
    const scale = Math.min(
      this.app.renderer.width / worldWidth,
      this.app.renderer.height / worldHeight,
    )
    this.world.scale.set(scale)
    this.world.position.set(
      (this.app.renderer.width - worldWidth * scale) / 2,
      (this.app.renderer.height - worldHeight * scale) / 2,
    )
  }
}
