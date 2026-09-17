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

  window.EJS_player = "#game"
  window.EJS_pathtodata = "data/"
  window.EJS_core = "gba"
  window.EJS_gameUrl = "rom/" + entryId
  window.EJS_gameID = "lx-game-" + entryId
  window.EJS_gameName = "lx-game-" + entryId
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
    void restoreSave()
    startAutosave()
  }

  // ESC 退出：EJS 弹窗打开时交由模拟器自己关闭，否则上报给宿主退出。
  window.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Escape") return
      if (document.querySelector(".ejs_popup_container")) return
      event.preventDefault()
      event.stopPropagation()
      report("escape")
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
