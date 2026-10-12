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

  // 动作 → EmulatorJS 玩家 0 槽位；value2 为手柄标签。
  // 1~3 号玩家槽必须显式保留空对象，EmulatorJS 会无条件遍历。
  var GBA_ACTION_SLOTS = {
    b: 0,
    select: 2,
    start: 3,
    up: 4,
    down: 5,
    left: 6,
    right: 7,
    a: 8,
    l: 10,
    r: 11,
  }
  var GBA_SLOT_LABELS = {
    0: "BUTTON_2",
    2: "SELECT",
    3: "START",
    4: "DPAD_UP",
    5: "DPAD_DOWN",
    6: "DPAD_LEFT",
    7: "DPAD_RIGHT",
    8: "BUTTON_1",
    10: "LEFT_TOP_SHOULDER",
    11: "RIGHT_TOP_SHOULDER",
  }

  // 默认键位（值为 EmulatorJS keyCode）：WASD 方向、J/K 为 A/B、Enter/Backspace 为
  // Start/Select、Q/E 为 L/R、U/I 连点、Tab 倍速、ESC 暂停。宿主未下发键位时兜底。
  var DEFAULT_KEYCODES = {
    b: 75,
    select: 8,
    start: 13,
    up: 87,
    down: 83,
    left: 65,
    right: 68,
    a: 74,
    l: 81,
    r: 69,
    turboA: 85,
    turboB: 73,
    speed: 9,
    pause: 27,
  }

  // 当前生效键位：由 URL keys 参数（应用侧按游戏下发）或宿主 keymap 消息驱动。
  var activeKeymap = normalizeKeymap(params.get("keys"))
  // 连点/倍速/暂停热键的运行时映射，随键位切换重建。
  var turboKeySlots = {}
  var speedKeyCode = 0
  var pauseKeyCode = 0

  // 连点：EmulatorJS 无 turbo 能力，按住连点键时由宿主以固定半周期交替模拟 A/B。
  var TURBO_HALF_PERIOD_MS = 50
  var turboTimers = {}
  var turboPressed = {}

  // 倍速：倍速键常驻循环 1x → 2x → 4x → 6x → 8x → 10x → 16x → 1x，每局从 1x 开始。
  var SPEED_STEPS = [1, 2, 4, 6, 8, 10, 16]
  var SPEED_APPLY_DELAY_MS = 10
  var speedStepIndex = 0

  // 键位归一化：只接受 14 个动作的合法正整数键值，非法项回退默认键位。
  function normalizeKeymap(raw) {
    var result = Object.assign({}, DEFAULT_KEYCODES)
    var source = raw
    if (typeof raw === "string") {
      try {
        source = JSON.parse(raw)
      } catch (error) {
        source = null
      }
    }
    if (!source || typeof source !== "object") return result
    Object.keys(result).forEach(function (action) {
      var value = source[action]
      if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        result[action] = value
      }
    })
    return result
  }

  // 键位 → EmulatorJS 控制映射（玩家 0），玩家 1~3 槽位保持空对象。
  function buildControls(keymap) {
    var player = {}
    Object.keys(GBA_ACTION_SLOTS).forEach(function (action) {
      var slot = GBA_ACTION_SLOTS[action]
      player[slot] = { value: keymap[action], value2: GBA_SLOT_LABELS[slot] }
    })
    return { 0: player, 1: {}, 2: {}, 3: {} }
  }

  // 把当前键位写入运行中的模拟器（旧 localStorage 设置已在启动时加载，这里覆盖回应用侧配置）。
  function applyKeymapToEmulator() {
    var emulator = window.EJS_emulator
    if (!emulator || !emulator.controls) return
    emulator.controls = buildControls(activeKeymap)
    if (typeof emulator.checkGamepadInputs === "function") emulator.checkGamepadInputs()
  }

  // 切换键位后重建热键映射，并挂断进行中的连点。
  function syncHotkeys() {
    stopAllTurbo()
    turboKeySlots = {}
    turboKeySlots[activeKeymap.turboA] = GBA_ACTION_SLOTS.a
    turboKeySlots[activeKeymap.turboB] = GBA_ACTION_SLOTS.b
    speedKeyCode = activeKeymap.speed
    pauseKeyCode = activeKeymap.pause
  }

  function stopAllTurbo() {
    Object.keys(turboKeySlots).forEach(function (keyCode) {
      stopTurbo(keyCode)
    })
  }

  // 应用宿主下发的键位：更新活动键位、模拟器控制映射与热键。
  function applyKeymap(raw) {
    activeKeymap = normalizeKeymap(raw)
    syncHotkeys()
    applyKeymapToEmulator()
  }

  syncHotkeys()

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
    var slot = turboKeySlots[keyCode]
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

  // 快速存档：槽位取值 1~9（与 EmulatorJS 设置一致）。
  var STATE_SLOT_COUNT = 9
  var STATE_SLOT_DEFAULT = 1

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
    var slot = turboKeySlots[keyCode]
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

  function normalizeStateSlot(raw) {
    var slot = parseInt(raw, 10)
    if (isNaN(slot) || slot < 1 || slot > STATE_SLOT_COUNT) return STATE_SLOT_DEFAULT
    return slot
  }

  // 快速存档改由应用侧托管：保存上报宿主落盘，读取走 lx-game:// 协议，不落内存文件系统。
  function installStateBridge() {
    var manager = getGameManager()
    if (!manager || manager.__lxStateBridge === true) return
    var loadState = manager.loadState.bind(manager)

    manager.quickSave = function (slot) {
      var normalized = normalizeStateSlot(slot)
      try {
        report("state", { slot: normalized, data: manager.getState() })
        return true
      } catch (error) {
        return false
      }
    }

    manager.quickLoad = function (slot) {
      var normalized = normalizeStateSlot(slot)
      window
        .fetch("state/" + entryId + "/" + normalized, { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) {
            var emulator = window.EJS_emulator
            if (emulator && typeof emulator.displayMessage === "function") {
              emulator.displayMessage(
                emulator.localization("NO SAVE STATE IN SLOT") + " " + normalized,
              )
            }
            return
          }
          return response.arrayBuffer().then(function (buffer) {
            loadState(new Uint8Array(buffer))
          })
        })
        .catch(function () {
          // 读取失败静默：不打断游戏。
        })
    }

    manager.__lxStateBridge = true
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

  window.EJS_player = "#game"
  window.EJS_pathtodata = "data/"
  window.EJS_core = "gba"
  window.EJS_gameUrl = "rom/" + entryId
  window.EJS_gameID = "lx-game-" + entryId
  window.EJS_gameName = "lx-game-" + entryId
  window.EJS_defaultControls = buildControls(activeKeymap)
  // 快进由宿主页的 Tab 倍速统一接管：隐藏 EmulatorJS 自带的快进菜单项，避免出现第二套入口。
  // 快速存档位置固定为应用侧托管，隐藏会诱导下载/浏览器存储的“存档位置”设置。
  window.EJS_hideSettings = ["fastForward", "ff-ratio", "save-state-location"]
  window.EJS_language = language
  window.EJS_disableAutoLang = true
  window.EJS_color = color
  window.EJS_startOnLoaded = true
  window.EJS_threads = false
  window.EJS_disableDatabases = true
  // 仓库内只携带未压缩源码（GPL 源码分发要求），以 debug 模式直接加载 data/src。
  window.EJS_DEBUG_XX = true
  // 存档与改键均由应用侧托管：隐藏 EmulatorJS 自带的存档文件按钮与 Control Settings
  // 改键入口（避免第二套事实源）；restart/cheat/netplay 等一并隐藏。
  window.EJS_Buttons = {
    gamepad: false,
    restart: false,
    cheat: false,
    netplay: false,
    screenRecord: false,
    cacheManager: false,
    exitEmulation: false,
    saveSavFiles: false,
    loadSavFiles: false,
    saveState: false,
    loadState: false,
  }

  window.EJS_ready = function () {
    attachSaveListener()
    installStateBridge()
    // localStorage 里可能残留旧的模拟器内改键，启动后统一覆盖为应用侧键位。
    applyKeymapToEmulator()
    report("ready")
  }

  window.EJS_onGameStart = function () {
    attachSaveListener()
    installStateBridge()
    applyKeymapToEmulator()
    report("started")
    // 每局都从 1x 开始：上次的高倍速不该悄悄带到下一局。
    setSpeedStep(0)
    void restoreSave()
    startAutosave()
  }

  // 暂停键：EJS 弹窗打开时交由模拟器自己关闭，否则上报给宿主切换暂停。
  window.addEventListener(
    "keydown",
    function (event) {
      if (event.keyCode !== pauseKeyCode) return
      if (isPopupOpen()) return
      event.preventDefault()
      event.stopPropagation()
      report("escape")
    },
    true,
  )

  // 连点热键在捕获阶段接管：连点键不在控制映射表里，模拟器自身不会处理。
  window.addEventListener(
    "keydown",
    function (event) {
      if (turboKeySlots[event.keyCode] === undefined || event.repeat) return
      if (!canSendInput()) return
      event.preventDefault()
      startTurbo(event.keyCode)
    },
    true,
  )

  window.addEventListener(
    "keyup",
    function (event) {
      if (turboKeySlots[event.keyCode] === undefined) return
      stopTurbo(event.keyCode)
    },
    true,
  )

  // 失焦时挂断连点，避免按键卡住。
  window.addEventListener("blur", function () {
    stopAllTurbo()
  })

  // 倍速循环：倍速键在 GBA 键位表里无映射，捕获阶段接管并阻止焦点切换。
  window.addEventListener(
    "keydown",
    function (event) {
      if (event.keyCode !== speedKeyCode || event.repeat) return
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
      return
    }
    // 应用侧改键即时生效：更新控制映射与连点/倍速/暂停热键。
    if (message.type === "keymap") {
      applyKeymap(message.keys)
      return
    }
    // 宿主暂停/恢复（最小化、ESC 切换）：模拟器核心自行处理播放状态。
    if (message.type === "pause" || message.type === "resume") {
      var emulator = window.EJS_emulator
      if (!emulator || emulator.started !== true) return
      if (message.type === "pause") {
        emulator.pause()
      } else {
        emulator.play()
      }
    }
  })
})()
