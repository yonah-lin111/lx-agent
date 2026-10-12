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

// 构造携带 keys 参数的宿主页地址（宿主按游戏下发的完整键位表）。
const wrapperSearch = (keys?: Record<string, number>): string => {
  const params = new URLSearchParams({ entry: "7", lang: "zh-CN", color: "#38bdf8" })
  if (keys) params.set("keys", JSON.stringify(keys))
  return `?${params.toString()}`
}

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
  localization: (text: string) => string
  displayMessage: (message: string) => void
  controls: Record<string, Record<string, { value: number; value2?: string }>>
  checkGamepadInputs: () => void
  gameManager: {
    simulateInput: (player: number, slot: number, value: number) => void
    toggleFastForward: (enabled: number) => void
    setFastForwardRatio: (ratio: number) => void
    getState: () => Uint8Array
    loadState: (state: Uint8Array) => void
    quickSave: (slot?: string | number) => boolean
    quickLoad: (slot?: string | number) => void
  }
}

// 最小 fetch 响应替身（快速存档读取走 lx-game:// 协议）。
interface FakeFetchResponse {
  ok: boolean
  arrayBuffer: () => Promise<ArrayBuffer>
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
  search?: string
  fetchImpl?: (url: string) => Promise<FakeFetchResponse>
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
  const getState = vi.fn((): Uint8Array => new Uint8Array([9, 9, 9]))
  const loadState = vi.fn()
  const localization = vi.fn((text: string) => text)
  const displayMessage = vi.fn()
  const report = vi.fn()
  const checkGamepadInputs = vi.fn()
  const messageCallbacks: Array<(message: unknown) => void> = []
  const emulator: FakeEmulator = {
    started: options.started ?? true,
    paused: options.paused ?? false,
    settingsMenu: { style: { display: options.menuDisplay ?? "none" } },
    getSettingValue: () => options.settingValue ?? null,
    isPopupOpen: () => options.popupOpen ?? false,
    localization,
    displayMessage,
    controls: {},
    checkGamepadInputs,
    gameManager: {
      simulateInput,
      toggleFastForward,
      setFastForwardRatio,
      getState,
      loadState,
      quickSave: () => false,
      quickLoad: () => {},
    },
  }

  const windowStub = {
    location: { search: options.search ?? wrapperSearch() },
    localStorage: storage,
    fetch: (url: string) =>
      options.fetchImpl ? options.fetchImpl(url) : Promise.reject(new Error("offline")),
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
    lxGameBridge: {
      report,
      onMessage: (callback: (message: unknown) => void) => messageCallbacks.push(callback),
    },
    EJS_emulator: emulator,
    EJS_defaultControls: undefined as
      | Record<string, Record<string, { value: number; value2?: string }>>
      | undefined,
    EJS_hideSettings: undefined as string[] | undefined,
    EJS_Buttons: undefined as Record<string, boolean> | undefined,
    EJS_ready: undefined as (() => void) | undefined,
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
    getState,
    loadState,
    localization,
    displayMessage,
    report,
    checkGamepadInputs,
    sendMessage: (message: unknown): void => {
      for (const callback of messageCallbacks) callback(message)
    },
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
    expect(loadWrapper().window.EJS_hideSettings).toEqual([
      "fastForward",
      "ff-ratio",
      "save-state-location",
    ])
  })

  it("隐藏会下载/选择本地文件的 Save State 按钮，存档统一走应用侧", () => {
    const buttons = loadWrapper().window.EJS_Buttons ?? {}

    expect(buttons.saveState).toBe(false)
    expect(buttons.loadState).toBe(false)
    expect(buttons.saveSavFiles).toBe(false)
    expect(buttons.loadSavFiles).toBe(false)
  })

  it("隐藏 EmulatorJS 自带的 Control Settings 改键入口（改键统一走应用面板）", () => {
    expect(loadWrapper().window.EJS_Buttons?.gamepad).toBe(false)
  })
})

describe("模拟器宿主页每游戏键位", () => {
  it("URL keys 参数覆盖对应动作，其余保持默认", () => {
    const harness = loadWrapper({ search: wrapperSearch({ up: 38, a: 88, pause: 80 }) })
    const player = (harness.window.EJS_defaultControls?.["0"] ?? {}) as Record<
      string,
      { value: number }
    >

    expect(player[4]?.value).toBe(38)
    expect(player[8]?.value).toBe(88)
    expect(player[6]?.value).toBe(65)
  })

  it("非法 keys 参数回退默认键位", () => {
    const harness = loadWrapper({ search: "?entry=7&keys=not-json" })
    const player = (harness.window.EJS_defaultControls?.["0"] ?? {}) as Record<
      string,
      { value: number }
    >

    expect(player[4]?.value).toBe(87)
    expect(player[8]?.value).toBe(74)
  })

  it("ready / onGameStart 把应用侧键位写入运行中的模拟器，覆盖存量 localStorage 设置", () => {
    const storedBlob = JSON.stringify({
      controlSettings: { 8: { value: 88, value2: "BUTTON_1" } },
      settings: { volume: 0.4 },
      cheats: [],
    })
    const harness = loadWrapper({
      search: wrapperSearch({ a: 80 }),
      storageSeed: { [SETTINGS_KEY]: storedBlob },
    })

    harness.window.EJS_ready?.()
    expect(harness.emulator.controls[0]?.[8]).toEqual({ value: 80, value2: "BUTTON_1" })
    expect(harness.checkGamepadInputs).toHaveBeenCalled()

    harness.emulator.controls = {}
    harness.window.EJS_onGameStart?.()
    expect(harness.emulator.controls[0]?.[8]).toEqual({ value: 80, value2: "BUTTON_1" })
  })

  it("不改写 localStorage 中的存量设置（旧模拟器内改键不迁移）", () => {
    const storedBlob = JSON.stringify({
      controlSettings: { 8: { value: 88, value2: "BUTTON_1" } },
      settings: { volume: 0.4 },
      cheats: [],
    })
    const harness = loadWrapper({ storageSeed: { [SETTINGS_KEY]: storedBlob } })

    harness.window.EJS_ready?.()
    harness.window.EJS_onGameStart?.()

    expect(harness.storage.getItem(SETTINGS_KEY)).toBe(storedBlob)
  })

  it("宿主 keymap 消息即时替换控制映射与热键", () => {
    const harness = loadWrapper()

    harness.sendMessage({ type: "keymap", keys: { a: 80, turboA: 70, speed: 72, pause: 80 } })

    expect(harness.emulator.controls[0]?.[8]).toEqual({ value: 80, value2: "BUTTON_1" })
    harness.press("keydown", 70)
    expect(Array.from(harness.timers.values()).map((timer) => timer.delay)).toEqual([50])
    harness.tick()
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 8, 1)

    harness.press("keydown", 72)
    harness.flushTimeouts()
    expect(harness.setFastForwardRatio).toHaveBeenLastCalledWith(2)

    harness.press("keydown", 80)
    expect(harness.report).toHaveBeenLastCalledWith({ type: "escape" })
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

  it("连点键可被每游戏键位重绑，默认 U/I 失效", () => {
    const harness = loadWrapper({ search: wrapperSearch({ turboA: 70, turboB: 71 }) })

    harness.press("keydown", 85)
    harness.press("keydown", 73)
    expect(harness.timers.size).toBe(0)

    harness.press("keydown", 70)
    harness.tick()
    expect(harness.simulateInput).toHaveBeenLastCalledWith(0, 8, 1)

    harness.press("keydown", 71)
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

  it("暂停键可被每游戏键位重绑，默认 ESC 失效", () => {
    const harness = loadWrapper({ search: wrapperSearch({ pause: 80 }) })

    const rebound = harness.press("keydown", 80)
    expect(harness.report).toHaveBeenLastCalledWith({ type: "escape" })
    expect(rebound.preventDefault).toHaveBeenCalled()

    harness.report.mockClear()
    harness.pressEscape()
    expect(harness.report).not.toHaveBeenCalled()
  })
})

describe("模拟器宿主页快速存档", () => {
  // 快速存档的 fetch 链路跨 vm 微任务队列，多轮 drain 后再走一次宏任务兜底。
  const flushTasks = async (): Promise<void> => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it("Quick Save 把 state 字节连同槽位上报宿主，不再写内存文件系统", () => {
    const harness = loadWrapper()
    harness.window.EJS_ready?.()

    expect(harness.emulator.gameManager.quickSave("2")).toBe(true)

    expect(harness.report).toHaveBeenCalledWith({
      type: "state",
      slot: 2,
      data: new Uint8Array([9, 9, 9]),
    })
  })

  it("槽位越界回退到 1；核心取档失败返回 false 且不上报", () => {
    const harness = loadWrapper()
    harness.window.EJS_ready?.()

    harness.emulator.gameManager.quickSave("99")
    expect(harness.report).toHaveBeenLastCalledWith({
      type: "state",
      slot: 1,
      data: new Uint8Array([9, 9, 9]),
    })

    harness.getState.mockImplementationOnce(() => {
      throw new Error("states unsupported")
    })
    expect(harness.emulator.gameManager.quickSave(1)).toBe(false)

    const stateCalls = harness.report.mock.calls.filter(([payload]) => payload.type === "state")
    expect(stateCalls).toHaveLength(1)
  })

  it("Quick Load 经 lx-game 协议读取槽位文件并载入核心", async () => {
    const urls: string[] = []
    const harness = loadWrapper({
      fetchImpl: (url) => {
        urls.push(url)
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(Uint8Array.from([4, 5, 6]).buffer),
        })
      },
    })
    harness.window.EJS_ready?.()

    harness.emulator.gameManager.quickLoad("3")
    await flushTasks()

    expect(urls).toEqual(["state/7/3"])
    expect(harness.loadState).toHaveBeenCalledTimes(1)
    expect(Array.from(harness.loadState.mock.calls[0]?.[0] as Uint8Array)).toEqual([4, 5, 6])
  })

  it("槽位无存档时提示且不载入、不弹文件选择器", async () => {
    const harness = loadWrapper({
      fetchImpl: () =>
        Promise.resolve({ ok: false, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    })
    harness.window.EJS_ready?.()

    harness.emulator.gameManager.quickLoad(4)
    await flushTasks()

    expect(harness.loadState).not.toHaveBeenCalled()
    expect(harness.localization).toHaveBeenCalledWith("NO SAVE STATE IN SLOT")
    expect(harness.displayMessage).toHaveBeenCalledWith("NO SAVE STATE IN SLOT 4")
  })

  it("每局开始重装桥接：重复安装不替换已有实现", () => {
    const harness = loadWrapper()
    harness.window.EJS_ready?.()
    const installedQuickSave = harness.emulator.gameManager.quickSave

    harness.window.EJS_onGameStart?.()

    expect(harness.emulator.gameManager.quickSave).toBe(installedQuickSave)
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

  it("每游戏键位经真实 setupKeys 归一化后派发到正确槽位", () => {
    const harness = loadWrapper({ search: wrapperSearch({ a: 70, up: 38 }) })
    const controls = harness.window.EJS_defaultControls as Record<string, unknown>

    const { prototype, self } = createVendoredControlHarness(controls)
    expect(self.controls[0][8].value).toBe(70)
    expect(self.controls[0][4].value).toBe(38)

    prototype.keyChange.call(self, {
      keyCode: 70,
      repeat: false,
      preventDefault: vi.fn(),
      type: "keydown",
    })
    expect(self.gameManager.simulateInput).toHaveBeenLastCalledWith(0, 8, 1)
  })

  it("keymap 消息更新后的控制映射符合 EmulatorJS 控制链路预期", () => {
    const harness = loadWrapper()
    harness.sendMessage({ type: "keymap", keys: { a: 70 } })

    const { self } = createVendoredControlHarness(harness.emulator.controls)
    expect(self.controls[0][8].value).toBe(70)
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

  it("倍速键可被每游戏键位重绑，默认 Tab 失效", () => {
    const harness = loadWrapper({ search: wrapperSearch({ speed: 72 }) })

    harness.press("keydown", 9)
    expect(harness.setFastForwardRatio).not.toHaveBeenCalled()

    harness.press("keydown", 72)
    harness.flushTimeouts()
    expect(harness.setFastForwardRatio).toHaveBeenLastCalledWith(2)
  })
})
