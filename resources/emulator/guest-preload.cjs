// lx-game webview 预加载桥：仅暴露“上报 / 接收”两个函数，不向宿主页暴露任何 Node 或 Electron 能力。
const { contextBridge, ipcRenderer } = require("electron")

const CHANNEL_GUEST_TO_HOST = "lx-game-guest"
const CHANNEL_HOST_TO_GUEST = "lx-game-host"

contextBridge.exposeInMainWorld("lxGameBridge", {
  report: (payload) => {
    if (!payload || typeof payload !== "object") return
    ipcRenderer.sendToHost(CHANNEL_GUEST_TO_HOST, payload)
  },
  onMessage: (callback) => {
    if (typeof callback !== "function") return
    ipcRenderer.on(CHANNEL_HOST_TO_GUEST, (_event, payload) => callback(payload))
  },
})
