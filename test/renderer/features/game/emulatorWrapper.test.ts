import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import { describe, expect, it, vi } from "vitest"

const WRAPPER_SOURCE = readFileSync(
  fileURLToPath(new URL("../../../../resources/emulator/wrapper.js", import.meta.url)),
  "utf8",
)

const VENDORED_EMULATOR_SOURCE = readFileSync(
  fileURLToPath(new URL("../../../../resources/emulator/data/src/emulator.js", import.meta.url)),
  "utf8",
)

// 单个已导入游戏的模拟器设置键：ejs-<gameId>-<core>-<gameName>-settings（core 段随版本可能变化）。
const SETTINGS_KEY = "ejs-lx-game-3-gba-lx-game-3-settings"
const KEYMAP_VERSION_KEY = "lx-game-keymap-version"

interface StorageLike {
  readonly length: number
  key: (index: number) => string | null
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

interface FakeEmulator {
  started: boolean
  paused: boolean
  settingsMenu: { style: { display: string } }
  getSettingValue: (id: string) => string | null
  isPopupOpen: () => boolean
  gameManager: {
    simulateInput: (player: number, slot: number, value: number) => void
    toggleFastForward: (enabled: number) => void
    setFastForwardRatio: (ratio: number) => void
  }
}

interface KeyEventLike {
  key?: string
  keyCode: number
  repeat: boolean
  preventDefault: () => void
  stopPropagation: () => void
}

interface LoadOptions {
  storageSeed?: Record<string, string>
  started?: boolean
  paused?: boolean
  menuDisplay?: string
  settingValue?: string
  popupOpen?: boolean
}

const createStorage = (seed: Record<string, string> = {}): StorageLike => {
  const entries = new Map<string, string>(Object.entries(seed))
  return {
    get length() {
      return entries.size
    },
    key: (index) => Array.from(entries.keys())[index] ?? null,
    getItem: (key) => (entries.has(key) ? (entries.get(key) as string) : null),
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => entries.clear(),
  }
}

// 在隔离的 vm 上下文中执行真实 wrapper.js，只替身浏览器宿主能力与 EmulatorJS 实例。
const loadWrapper = (options: LoadOptions = {}) => {
  const storage = createStorage(options.storageSeed)
  const listeners = new Map<string, Array<(event: KeyEventLike) => void>>()
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const timeouts: Array<() => void> = []
  let nextTimerId = 1

  const simulateInput = vi.fn()
  const toggleFastForward = vi.fn()
  const setFastForwardRatio = vi.fn()
  const report = vi.fn()
  const emulator: FakeEmulator = {
    started: options.started ?? true,
    paused: options.paused ?? false,
    settingsMenu: { style: { display: options.menuDisplay ?? "none" } },
    getSettingValue: () => options.settingValue ?? null,
    isPopupOpen: () => options.popupOpen ?? false,
    gameManager: { simulateInput, toggleFastForward, setFastForwardRatio },
  }

  const windowStub = {
    location: { search: "?entry=7&lang=zh-CN&color=%2338bdf8" },
    localStorage: storage,
    fetch: () => Promise.reject(new Error("offline")),
    addEventListener: (type: string, listener: (event: KeyEventLike) => void) => {
      const bucket = listeners.get(type) ?? []
      bucket.push(listener)
      listeners.set(type, bucket)
    },
    setInterval: (callback: () => void, delay: number) => {
      const id = nextTimerId
      nextTimerId += 1
      timers.set(id, { callback, delay })
      return id
    },
    clearInterval: (id: number) => {
      timers.delete(id)
    },
    setTimeout: (callback: () => void) => {
      timeouts.push(callback)
      return timeouts.length
    },
    clearTimeout: vi.fn(),
    lxGameBridge: { report, onMessage: vi.fn() },
    EJS_emulator: emulator,
    EJS_defaultControls: undefined as
      | Record<string, Record<string, { value: number; value2?: string }>>
      | undefined,
    EJS_hideSettings: undefined as string[] | undefined,
    EJS_onGameStart: undefined as (() => void) | undefined,
  }

  vm.runInNewContext(WRAPPER_SOURCE, {
    window: windowStub,
    localStorage: storage,
    URLSearchParams,
  })

  const dispatch = (type: string, event: KeyEventLike): void => {
    for (const listener of listeners.get(type) ?? []) listener(event)
  }

  return {
    window: windowStub,
    storage,
    emulator,
    simulateInput,
    toggleFastForward,
    setFastForwardRatio,
    report,
    timers,
    flushTimeouts: (): void => {
      while (timeouts.length > 0) {
        const callback = timeouts.shift() as () => void
        callback()
      }
    },
    press: (type: "keydown" | "keyup", keyCode: number, repeat = false): KeyEventLike => {
      const event: KeyEventLike = {
        keyCode,
        repeat,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }
      dispatch(type, event)
      return event
    },
    pressEscape: (): KeyEventLike => {
      const event: KeyEventLike = {
        key: "Escape",
        keyCode: 27,
        repeat: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }
      dispatch("keydown", event)
      return event
    },
    blur: (): void =>
      dispatch("blur", {
        keyCode: 0,
        repeat: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }),
    tick: (): void => {
      for (const timer of Array.from(timers.values())) timer.callback()
    },
  }
}

describe("模拟器宿主页默认键位", () => {
  it("注入 WASD 方向、J/K 为 A/B、Enter/Backspace 为 Start/Select、Q/E 为 L/R", () => {
    const harness = loadWrapper()

    expect(harness.window.EJS_defaultControls).toEqual({
      0: {
        0: { value: 75, value2: "BUTTON_2" },
        2: { value: 8, value2: "SELECT" },
        3: { value: 13, value2: "START" },
        4: { value: 87, value2: "DPAD_UP" },
        5: { value: 83, value2: "DPAD_DOWN" },
        6: { value: 65, value2: "DPAD_LEFT" },
        7: { value: 68, value2: "DPAD_RIGHT" },
        8: { value: 74, value2: "BUTTON_1" },
        10: { value: 81, value2: "LEFT_TOP_SHOULDER" },
        11: { value: 69, value2: "RIGHT_TOP_SHOULDER" },
      },
      1: {},
      2: {},
      3: {},
    })
  })

  it("U/I 不写入控制映射表（连点由宿主侧模拟），Space 不再绑定快进", () => {
    const controls = loadWrapper().window.EJS_defaultControls ?? {}
    const playerControls = controls["0"] ?? {}

    const boundKeys = Object.values(playerControls).map((control) => control.value)
    expect(boundKeys).not.toContain(85)
    expect(boundKeys).not.toContain(73)
    expect(boundKeys).not.toContain(32)
  })

  it("隐藏 EmulatorJS 自带的快进菜单项（快进由宿主页统一接管）", () => {
    expect(loadWrapper().window.EJS_hideSettings).toEqual(["fastForward", "ff-ratio"])
  })
})

describe("模拟器宿主页键位迁移", () => {
  it("把已落盘的 controlSettings 换成新默认映射，保留其余设置", () => {
    const legacyBlob = JSON.stringify({
      controlSettings: {
        4: { value: 38, value2: "DPAD_UP" },
        8: { value: 90, value2: "BUTTON_1" },
      },
      settings: { volume: 0.4, shader: "disabled" },
      cheats: [{ desc: "demo", code: "AAAA", checked: true }],
    })
    const globalSettings = JSON.stringify({ volume: 0.4, muted: false })
    const harness = loadWrapper({
      storageSeed: {
        [SETTINGS_KEY]: legacyBlob,
        "ejs-lx-game-9-mgba-lx-game-9-settings": JSON.stringify({ settings: {}, cheats: [] }),
        "ejs-other-settings": JSON.stringify({ manual: true }),
        "ejs-settings": globalSettings,
      },
    })

    const migrated = JSON.parse(harness.storage.getItem(SETTINGS_KEY) as string)
    expect(migrated.controlSettings).toEqual(harness.window.EJS_defaultControls)
    // 结构必须是 玩家 → 槽位；扁平结构会让 EmulatorJS 的控制遍历崩溃。
    expect(migrated.controlSettings[0][8]).toEqual({ value: 74, value2: "BUTTON_1" })
    expect(migrated.controlSettings[1]).toEqual({})
    expect(migrated.settings).toEqual({ volume: 0.4, shader: "disabled" })
    expect(migrated.cheats).toEqual([{ desc: "demo", code: "AAAA", checked: true }])
    expect(harness.storage.getItem(KEYMAP_VERSION_KEY)).toBe("3")

    // 无 controlSettings 的游戏设置与非游戏键一律不动。
    expect(
      JSON.parse(harness.storage.getItem("ejs-lx-game-9-mgba-lx-game-9-settings") as string),
    ).toEqual({ settings: {}, cheats: [] })
    expect(harness.storage.getItem("ejs-other-settings")).toBe(JSON.stringify({ manual: true }))
    expect(harness.storage.getItem("ejs-settings")).toBe(globalSettings)
  })

  it("迁移标记已写入时不再覆盖用户在模拟器里的手动改键", () => {
    const userBlob = JSON.stringify({
      controlSettings: { 8: { value: 88, value2: "BUTTON_1" } },
      settings: {},
      cheats: [],
    })
    const harness = loadWrapper({
      storageSeed: { [SETTINGS_KEY]: userBlob, [KEYMAP_VERSION_KEY]: "3" },
    })

    expect(JSON.parse(harness.storage.getItem(SETTINGS_KEY) as string).controlSettings).toEqual({
      8: { value: 88, value2: "BUTTON_1" },
    })
  })
})

describe("模拟器宿主页连点", () => {
  it("按住 U 以 50ms 半周期交替模拟 A，松手归零", () => {
    const harness = loadWrapper()

    const pressed = harness.press("keydown", 85)
    expect(pressed.preventDefault).toHaveBeenCalled()
    expect(Array.from(harness.timers.values()).map((timer) => timer.delay)).toEqual([50])

    harness.tick()
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 8, 1)
    harness.tick()
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 8, 0)
    harness.tick()
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 8, 1)

    harness.press("keyup", 85)
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 8, 0)
    expect(harness.timers.size).toBe(0)

    const callCount = harness.simulateInput.mock.calls.length
    harness.tick()
    expect(harness.simulateInput).toHaveBeenCalledTimes(callCount)
  })

  it("按住 I 连点 B", () => {
    const harness = loadWrapper()

    harness.press("keydown", 73)
    harness.tick()
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 0, 1)
  })

  it("键盘自动重复、非连点按键与 U/I 之外的键不启动连点", () => {
    const harness = loadWrapper()

    harness.press("keydown", 85, true)
    harness.press("keydown", 74)
    harness.press("keydown", 32)
    expect(harness.timers.size).toBe(0)
    expect(harness.simulateInput).not.toHaveBeenCalled()
  })

  it("弹窗、设置菜单、暂停、未运行或键盘输入模式下连点不触发", () => {
    const withPopup = loadWrapper({ popupOpen: true })
    withPopup.press("keydown", 85)
    expect(withPopup.timers.size).toBe(0)

    const withMenu = loadWrapper({ menuDisplay: "" })
    withMenu.press("keydown", 85)
    expect(withMenu.timers.size).toBe(0)

    const paused = loadWrapper({ paused: true })
    paused.press("keydown", 85)
    expect(paused.timers.size).toBe(0)

    const notStarted = loadWrapper({ started: false })
    notStarted.press("keydown", 85)
    expect(notStarted.timers.size).toBe(0)

    const keyboardMode = loadWrapper({ settingValue: "enabled" })
    keyboardMode.press("keydown", 85)
    expect(keyboardMode.timers.size).toBe(0)
  })

  it("连点中途打开菜单或窗口失焦会立即挂断并归零", () => {
    const menuHarness = loadWrapper()
    menuHarness.press("keydown", 85)
    menuHarness.tick()
    menuHarness.emulator.settingsMenu.style.display = ""
    menuHarness.tick()
    expect(menuHarness.simulateInput).toHaveBeenLastCalledWith(0, 8, 0)
    expect(menuHarness.timers.size).toBe(0)

    const blurHarness = loadWrapper()
    blurHarness.press("keydown", 85)
    blurHarness.tick()
    blurHarness.blur()
    expect(blurHarness.simulateInput).toHaveBeenLastCalledWith(0, 8, 0)
    expect(blurHarness.timers.size).toBe(0)
  })
})

describe("模拟器宿主页 ESC 退出", () => {
  it("无弹窗时按 ESC 上报退出", () => {
    const harness = loadWrapper()

    const event = harness.pressEscape()
    expect(harness.report).toHaveBeenCalledWith({ type: "escape" })
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it("模拟器自身弹窗打开时 ESC 不外泄", () => {
    const harness = loadWrapper({ popupOpen: true })

    harness.pressEscape()
    expect(harness.report).not.toHaveBeenCalled()
  })
})

interface VendoredControlHarness {
  started: boolean
  debug: boolean
  settingsMenu: { style: { display: string } }
  controlPopup: { parentElement: { parentElement: { getAttribute: () => string | null } } }
  isPopupOpen: () => boolean
  getSettingValue: (id: string) => string | null
  defaultControllers: Record<string, unknown>
  controls: Record<string, Record<string, { value: number }>>
  keyMap: Record<number, string>
  gameManager: { simulateInput: ReturnType<typeof vi.fn> }
}

interface VendoredEmulatorPrototype {
  initControlVars: (this: VendoredControlHarness) => void
  setupKeys: (this: VendoredControlHarness) => void
  keyChange: (
    this: VendoredControlHarness,
    event: { keyCode: number; repeat: boolean; preventDefault: () => void; type: string },
  ) => void
}

// 用真实 vendored EmulatorJS 的控制链路校验注入映射：槽位结构不符（如缺 1~3 号玩家）会在这里炸。
const createVendoredControlHarness = (controls: Record<string, unknown>) => {
  const context: { window: { EmulatorJS?: { prototype: VendoredEmulatorPrototype } } } = {
    window: {},
  }
  vm.runInNewContext(VENDORED_EMULATOR_SOURCE, context)
  const prototype = (context.window.EmulatorJS as { prototype: VendoredEmulatorPrototype })
    .prototype

  // 以真实原型链为底，setupKeys 等实现依赖 this.keyLookup / this.keyMap。
  const self = Object.assign(Object.create(prototype) as VendoredControlHarness, {
    started: true,
    debug: false,
    settingsMenu: { style: { display: "none" } },
    controlPopup: { parentElement: { parentElement: { getAttribute: () => "hidden" } } },
    isPopupOpen: () => false,
    getSettingValue: () => null,
    defaultControllers: {},
    controls: {},
    keyMap: {},
    gameManager: { simulateInput: vi.fn() },
  })

  prototype.initControlVars.call(self)
  self.defaultControllers = controls
  // 模拟 createControlSettingMenu：克隆默认映射后由 setupKeys 归一化键值。
  self.controls = JSON.parse(JSON.stringify(controls))
  prototype.setupKeys.call(self)

  return { prototype, self }
}

describe("注入键位与 vendored EmulatorJS 控制链路", () => {
  const injectedControls = (): Record<string, unknown> =>
    loadWrapper().window.EJS_defaultControls as Record<string, unknown>

  it("玩家 0~3 槽位齐备，setupKeys 归一化后键值与注入一致", () => {
    const controls = injectedControls()
    for (const player of ["0", "1", "2", "3"]) {
      expect(controls[player]).toBeDefined()
    }

    const { self } = createVendoredControlHarness(controls)
    expect(self.controls[0][8].value).toBe(74)
    expect(self.controls[0][0].value).toBe(75)
    expect(self.controls[0][4].value).toBe(87)
  })

  it("迁移写回的存量设置符合 EmulatorJS 控制链路预期", () => {
    const legacyBlob = JSON.stringify({
      controlSettings: { 4: { value: 38, value2: "DPAD_UP" } },
      settings: { volume: 0.4 },
      cheats: [],
    })
    const harness = loadWrapper({ storageSeed: { [SETTINGS_KEY]: legacyBlob } })
    const migrated = JSON.parse(harness.storage.getItem(SETTINGS_KEY) as string)

    const { self } = createVendoredControlHarness(migrated.controlSettings)
    expect(self.controls[0][8].value).toBe(74)
    expect(self.controls[1]).toEqual({})
  })

  it("真实 keyChange 把新键位派发到正确槽位", () => {
    const { prototype, self } = createVendoredControlHarness(injectedControls())
    const press = (keyCode: number, type: "keydown" | "keyup"): void => {
      prototype.keyChange.call(self, { keyCode, repeat: false, preventDefault: vi.fn(), type })
    }

    press(87, "keydown")
    expect(self.gameManager.simulateInput).toHaveBeenLastCalledWith(0, 4, 1)
    press(74, "keydown")
    expect(self.gameManager.simulateInput).toHaveBeenLastCalledWith(0, 8, 1)
    press(74, "keyup")
    expect(self.gameManager.simulateInput).toHaveBeenLastCalledWith(0, 8, 0)
    press(75, "keydown")
    expect(self.gameManager.simulateInput).toHaveBeenLastCalledWith(0, 0, 1)
    press(13, "keydown")
    expect(self.gameManager.simulateInput).toHaveBeenLastCalledWith(0, 3, 1)
  })

  it("Space 不再派发任何输入（快进已改由 Tab 倍速接管）", () => {
    const { prototype, self } = createVendoredControlHarness(injectedControls())

    prototype.keyChange.call(self, {
      keyCode: 32,
      repeat: false,
      preventDefault: vi.fn(),
      type: "keydown",
    })

    expect(self.gameManager.simulateInput).not.toHaveBeenCalled()
  })
})

describe("模拟器宿主页倍速", () => {
  it("Tab 逐档循环 2/4/6/8/10/16，回到 1x 时不再开启快进", () => {
    const harness = loadWrapper()

    for (const ratio of [2, 4, 6, 8, 10, 16]) {
      harness.press("keydown", 9)
      harness.flushTimeouts()
      expect(harness.setFastForwardRatio).toHaveBeenLastCalledWith(ratio)
      expect(harness.toggleFastForward.mock.calls.at(-2)).toEqual([0])
      expect(harness.toggleFastForward).toHaveBeenLastCalledWith(1)
      expect(harness.report).toHaveBeenLastCalledWith({ type: "speed", ratio })
    }

    harness.press("keydown", 9)
    harness.flushTimeouts()
    expect(harness.setFastForwardRatio).toHaveBeenLastCalledWith(1)
    expect(harness.toggleFastForward).toHaveBeenLastCalledWith(0)
    expect(harness.report).toHaveBeenLastCalledWith({ type: "speed", ratio: 1 })
  })

  it("Tab 阻止焦点切换，自动重复不重复切档", () => {
    const harness = loadWrapper()

    const event = harness.press("keydown", 9)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(harness.setFastForwardRatio).toHaveBeenCalledTimes(1)

    harness.press("keydown", 9, true)
    expect(harness.setFastForwardRatio).toHaveBeenCalledTimes(1)
  })

  it("弹窗、设置菜单或未运行时 Tab 不切档", () => {
    const withPopup = loadWrapper({ popupOpen: true })
    withPopup.press("keydown", 9)
    expect(withPopup.setFastForwardRatio).not.toHaveBeenCalled()

    const withMenu = loadWrapper({ menuDisplay: "" })
    withMenu.press("keydown", 9)
    expect(withMenu.setFastForwardRatio).not.toHaveBeenCalled()

    const notStarted = loadWrapper({ started: false })
    notStarted.press("keydown", 9)
    expect(notStarted.setFastForwardRatio).not.toHaveBeenCalled()
  })

  it("每局开始重置为 1x 并上报宿主", () => {
    const harness = loadWrapper()
    harness.press("keydown", 9)
    harness.flushTimeouts()
    expect(harness.setFastForwardRatio).toHaveBeenLastCalledWith(2)

    harness.window.EJS_onGameStart?.()

    expect(harness.setFastForwardRatio).toHaveBeenLastCalledWith(1)
    expect(harness.toggleFastForward).toHaveBeenLastCalledWith(0)
    expect(harness.report).toHaveBeenCalledWith({ type: "speed", ratio: 1 })
  })
})
