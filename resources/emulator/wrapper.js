// GBA 模拟器宿主页引导：解析查询参数、配置 EmulatorJS、经 guest-preload 桥上报状态与存档。
// 运行环境为 webview 沙箱页（无 Node、无网络），资源与 ROM/存档均来自 lx-game:// 自定义协议。
(function () {
  "use strict"

  var AUTOSAVE_INTERVAL_MS = 15000

  var params = new URLSearchParams(window.location.search)
  var entryId = String(parseInt(params.get("entry") || "", 10) || "")
  var language = params.get("lang") || "en-US"
  var color = params.get("color") || "#3b82f6"

  var bridge = window.lxGameBridge || { report: function () {}, onMessage: function () {} }
  var autosaveTimer = null
  var saveListenerAttached = false

  // GBA 默认键位（玩家 0 → 槽位 → keyCode + 手柄标签）：WASD 方向、J/K 为 A/B、
  // Enter/Backspace 为 Start/Select、Q/E 为 L/R。
  // 1~3 号玩家槽必须显式保留空对象，EmulatorJS 会无条件遍历。
  var GBA_DEFAULT_CONTROLS = {
    0: {
      0: { value: 75, value2: "BUTTON_2" }, // B：K
      2: { value: 8, value2: "SELECT" }, // Select：Backspace
      3: { value: 13, value2: "START" }, // Start：Enter
      4: { value: 87, value2: "DPAD_UP" }, // 上：W
      5: { value: 83, value2: "DPAD_DOWN" }, // 下：S
      6: { value: 65, value2: "DPAD_LEFT" }, // 左：A
      7: { value: 68, value2: "DPAD_RIGHT" }, // 右：D
      8: { value: 74, value2: "BUTTON_1" }, // A：J
      10: { value: 81, value2: "LEFT_TOP_SHOULDER" }, // L：Q
      11: { value: 69, value2: "RIGHT_TOP_SHOULDER" }, // R：E
    },
    1: {},
    2: {},
    3: {},
  }

  // 连点：EmulatorJS 无 turbo 能力，按住 U/I 时由宿主以固定半周期交替模拟 A/B。
  var TURBO_HALF_PERIOD_MS = 50
  var TURBO_KEY_SLOTS = { 85: 8, 73: 0 }
  var turboTimers = {}
  var turboPressed = {}

  // 倍速：Tab 常驻循环 1x → 2x → 4x → 6x → 8x → 10x → 16x → 1x，每局从 1x 开始。
  var SPEED_STEPS = [1, 2, 4, 6, 8, 10, 16]
  var SPEED_APPLY_DELAY_MS = 10
  var TAB_KEY_CODE = 9
  var speedStepIndex = 0

  // 键位迁移：命中版本标记后，把所有已落盘的 controlSettings 换成新默认映射（保留其余设置）。
  // 版本 2：修复 1 号版本写入的扁平结构（缺玩家层级），启动后强制重新迁移。
  // 版本 3：移除 Space 快进绑定（快进改由 Tab 倍速接管），启动后强制重新迁移。
  var KEYMAP_VERSION = "3"
  var KEYMAP_VERSION_KEY = "lx-game-keymap-version"
  var GAME_SETTINGS_PREFIX = "ejs-lx-game-"
  var GAME_SETTINGS_SUFFIX = "-settings"

  // 离线约束：拦截 EmulatorJS 的版本检查等外部请求，guest 页不做任何出网访问。
  var nativeFetch = window.fetch.bind(window)
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : input && input.url ? input.url : ""
    if (/^(https?|ftp):/i.test(url)) return Promise.reject(new Error("offline"))
    return nativeFetch(input, init)
  }

  function report(type, payload) {
    try {
      bridge.report(Object.assign({ type: type }, payload || {}))
    } catch (error) {
      // 上报失败不阻塞模拟器运行。
    }
  }

  function getGameManager() {
    var emulator = window.EJS_emulator
    return emulator && emulator.gameManager ? emulator.gameManager : null
  }

  // 历史按键设置迁移到当前默认映射；标记写入后不再覆盖用户在模拟器里的手动改键。
  function migrateControlSettings() {
    try {
      if (window.localStorage.getItem(KEYMAP_VERSION_KEY) === KEYMAP_VERSION) return
      for (var index = 0; index < localStorage.length; index++) {
        var key = localStorage.key(index)
        if (!key || key.indexOf(GAME_SETTINGS_PREFIX) !== 0) continue
        if (key.slice(-GAME_SETTINGS_SUFFIX.length) !== GAME_SETTINGS_SUFFIX) continue
        var stored = JSON.parse(localStorage.getItem(key) || "null")
        if (!stored || typeof stored !== "object" || !stored.controlSettings) continue
        stored.controlSettings = JSON.parse(JSON.stringify(GBA_DEFAULT_CONTROLS))
        localStorage.setItem(key, JSON.stringify(stored))
      }
      localStorage.setItem(KEYMAP_VERSION_KEY, KEYMAP_VERSION)
    } catch (error) {
      // localStorage 不可用时保持 EmulatorJS 自身行为。
    }
  }

  function simulateInput(slot, value) {
    var manager = getGameManager()
    if (!manager) return
    try {
      manager.simulateInput(0, slot, value)
    } catch (error) {
      // 核心未就绪时忽略。
    }
  }

  // 模拟器弹窗/菜单判定：宿主页常驻一个隐藏的“拖入存档”面板，不能只看 .ejs_popup_container 是否存在。
  function isPopupOpen() {
    var emulator = window.EJS_emulator
    if (!emulator || typeof emulator.isPopupOpen !== "function") return false
    try {
      return emulator.isPopupOpen() === true
    } catch (error) {
      return false
    }
  }

  // 与 EmulatorJS 内部判定对齐：弹窗、设置菜单、键盘输入模式、暂停或未运行时都不注入输入。
  function canSendInput() {
    if (isPopupOpen()) return false
    var emulator = window.EJS_emulator
    if (!emulator || emulator.started !== true || emulator.paused === true) return false
    if (emulator.settingsMenu && emulator.settingsMenu.style.display !== "none") return false
    if (
      typeof emulator.getSettingValue === "function" &&
      emulator.getSettingValue("keyboardInput") === "enabled"
    ) {
      return false
    }
    return true
  }

  function stopTurbo(keyCode) {
    var slot = TURBO_KEY_SLOTS[keyCode]
    if (slot === undefined) return
    if (turboTimers[keyCode]) {
      window.clearInterval(turboTimers[keyCode])
      turboTimers[keyCode] = null
    }
    if (turboPressed[keyCode]) {
      turboPressed[keyCode] = false
      simulateInput(slot, 0)
    }
  }

  // 倍速直接操作核心快进：先关闭再设倍率，随后延时重新开启（与 EmulatorJS 菜单内部时序一致）。
  function applySpeedRatio(ratio) {
    var manager = getGameManager()
    if (!manager) return
    try {
      manager.toggleFastForward(0)
      manager.setFastForwardRatio(ratio)
    } catch (error) {
      // 核心未就绪时忽略。
    }
    if (ratio <= 1) return
    window.setTimeout(function () {
      var current = getGameManager()
      if (!current) return
      try {
        current.toggleFastForward(1)
      } catch (error) {
        // 核心退出瞬间忽略。
      }
    }, SPEED_APPLY_DELAY_MS)
  }

  // 切到指定档位并把当前倍速上报宿主页顶部徽标。
  function setSpeedStep(index) {
    speedStepIndex = (index + SPEED_STEPS.length) % SPEED_STEPS.length
    var ratio = SPEED_STEPS[speedStepIndex]
    applySpeedRatio(ratio)
    report("speed", { ratio: ratio })
  }

  function cycleSpeed() {
    setSpeedStep(speedStepIndex + 1)
  }

  function startTurbo(keyCode) {
    var slot = TURBO_KEY_SLOTS[keyCode]
    if (slot === undefined || turboTimers[keyCode]) return
    turboPressed[keyCode] = false
    turboTimers[keyCode] = window.setInterval(function () {
      if (!canSendInput()) {
        stopTurbo(keyCode)
        return
      }
      turboPressed[keyCode] = !turboPressed[keyCode]
      simulateInput(slot, turboPressed[keyCode] ? 1 : 0)
    }, TURBO_HALF_PERIOD_MS)
  }

  // 触发核心把内存存档刷入虚拟文件系统；saveSaveFiles 事件会带回 SRAM 字节。
  function flushSave() {
    var manager = getGameManager()
    if (!manager) return
    try {
      manager.saveSaveFiles()
    } catch (error) {
      report("error", { message: "flush failed: " + String(error) })
    }
  }

  function handleSaveFiles(save) {
    if (!save || !save.length) return
    report("save", { data: save })
  }

  function attachSaveListener() {
    if (saveListenerAttached) return
    var emulator = window.EJS_emulator
    if (!emulator || !emulator.on) return
    emulator.on("saveSaveFiles", handleSaveFiles)
    saveListenerAttached = true
  }

  function startAutosave() {
    if (autosaveTimer) window.clearInterval(autosaveTimer)
    autosaveTimer = window.setInterval(flushSave, AUTOSAVE_INTERVAL_MS)
  }

  // 启动时回灌应用持有的 SRAM：写入核心虚拟文件系统后 refresh_save_files。
  async function restoreSave() {
    var manager = getGameManager()
    if (!manager) return
    try {
      var response = await window.fetch("sav/" + entryId, { cache: "no-store" })
      if (!response.ok) return
      var bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length === 0) return

      var savePath = manager.getSaveFilePath()
      var parts = savePath.split("/")
      var current = ""
      for (var index = 0; index < parts.length - 1; index++) {
        if (parts[index] === "") continue
        current += "/" + parts[index]
        if (!manager.FS.analyzePath(current).exists) manager.FS.mkdir(current)
      }
      if (manager.FS.analyzePath(savePath).exists) manager.FS.unlink(savePath)
      manager.FS.writeFile(savePath, bytes)
      manager.loadSaveFiles()
      report("save-restored", { size: bytes.length })
    } catch (error) {
      report("error", { message: "restore failed: " + String(error) })
    }
  }

  if (!entryId) {
    report("error", { message: "missing game entry" })
    return
  }

  migrateControlSettings()

  window.EJS_player = "#game"
  window.EJS_pathtodata = "data/"
  window.EJS_core = "gba"
  window.EJS_gameUrl = "rom/" + entryId
  window.EJS_gameID = "lx-game-" + entryId
  window.EJS_gameName = "lx-game-" + entryId
  window.EJS_defaultControls = GBA_DEFAULT_CONTROLS
  // 快进由宿主页的 Tab 倍速统一接管：隐藏 EmulatorJS 自带的快进菜单项，避免出现第二套入口。
  window.EJS_hideSettings = ["fastForward", "ff-ratio"]
  window.EJS_language = language
  window.EJS_disableAutoLang = true
  window.EJS_color = color
  window.EJS_startOnLoaded = true
  window.EJS_threads = false
  window.EJS_disableDatabases = true
  // 仓库内只携带未压缩源码（GPL 源码分发要求），以 debug 模式直接加载 data/src。
  window.EJS_DEBUG_XX = true
  // 存档由应用侧托管：隐藏 EmulatorJS 自带的存档文件按钮；restart/cheat/netplay 等一并隐藏。
  window.EJS_Buttons = {
    restart: false,
    cheat: false,
    netplay: false,
    screenRecord: false,
    cacheManager: false,
    exitEmulation: false,
    saveSavFiles: false,
    loadSavFiles: false,
  }

  window.EJS_ready = function () {
    attachSaveListener()
    report("ready")
  }

  window.EJS_onGameStart = function () {
    attachSaveListener()
    report("started")
    // 每局都从 1x 开始：上次的高倍速不该悄悄带到下一局。
    setSpeedStep(0)
    void restoreSave()
    startAutosave()
  }

  // ESC 退出：EJS 弹窗打开时交由模拟器自己关闭，否则上报给宿主退出。
  window.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Escape") return
      if (isPopupOpen()) return
      event.preventDefault()
      event.stopPropagation()
      report("escape")
    },
    true,
  )

  // 连点热键在捕获阶段接管：U/I 不在控制映射表里，模拟器自身不会处理这两个键。
  window.addEventListener(
    "keydown",
    function (event) {
      if (TURBO_KEY_SLOTS[event.keyCode] === undefined || event.repeat) return
      if (!canSendInput()) return
      event.preventDefault()
      startTurbo(event.keyCode)
    },
    true,
  )

  window.addEventListener(
    "keyup",
    function (event) {
      if (TURBO_KEY_SLOTS[event.keyCode] === undefined) return
      stopTurbo(event.keyCode)
    },
    true,
  )

  // 失焦时挂断连点，避免按键卡住。
  window.addEventListener("blur", function () {
    Object.keys(TURBO_KEY_SLOTS).forEach(function (keyCode) {
      stopTurbo(keyCode)
    })
  })

  // 倍速循环：Tab 在 GBA 键位表里无映射，捕获阶段接管并阻止焦点切换。
  window.addEventListener(
    "keydown",
    function (event) {
      if (event.keyCode !== TAB_KEY_CODE || event.repeat) return
      if (!canSendInput()) return
      event.preventDefault()
      cycleSpeed()
    },
    true,
  )

  bridge.onMessage(function (message) {
    if (!message || typeof message !== "object") return
    if (message.type === "flush") {
      flushSave()
      report("flushed")
    }
  })
})()
