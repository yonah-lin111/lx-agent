import net from "node:net"
import { GatewayClient } from "@openclaw/gateway-client"
import { PROTOCOL_VERSION } from "@openclaw/gateway-protocol/version"
import type { OpenClawConnectResult } from "@shared/contracts/openclaw"
import type { OpenClawInstanceConfig } from "@shared/settings"
import { buildOpenClawHostDeps } from "@/services/openclaw/openclawDeviceAuth"
import { getOpenClawSettings } from "@/services/settingsService"
import { CLIENT_CAPS, OPERATOR_SCOPES } from "./constants"
import { parseConnectError } from "./payloadMappers"
import type { InstanceConnection, OpenClawClientManagerHost } from "./types"

// 读取指定实例配置；不存在或未启用时返回 null。
export function resolveConfig(instanceId: string): OpenClawInstanceConfig | null {
  const settings = getOpenClawSettings()
  const config = settings.instances[instanceId]
  if (!config || !config.enabled) return null
  return config
}

export function getOrCreateConnection(
  host: OpenClawClientManagerHost,
  instanceId: string,
): InstanceConnection {
  const existing = host.connections.get(instanceId)
  if (existing) return existing

  const config = resolveConfig(instanceId)
  if (!config) throw new Error(`OpenClaw instance not found or disabled: ${instanceId}`)

  const connection: InstanceConnection = {
    instanceId,
    config,
    client: null,
    status: "disconnected",
    sessions: new Map(),
  }
  host.connections.set(instanceId, connection)
  return connection
}

// 设置页可能改动实例配置，操作前刷新内存配置。
export function refreshConnectionConfig(connection: InstanceConnection): void {
  const config = resolveConfig(connection.instanceId)
  if (config) connection.config = config
}

/**
 * 建立（或复用）到指定实例的连接。
 */
export async function connect(
  host: OpenClawClientManagerHost,
  instanceId: string,
): Promise<OpenClawConnectResult> {
  let connection: InstanceConnection
  try {
    connection = getOrCreateConnection(host, instanceId)
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) }
  }

  // 配置可能在设置页被改动，重连前刷新。
  const config = resolveConfig(instanceId)
  if (config) connection.config = config

  if (connection.client && connection.status === "connected") {
    return { status: "connected" }
  }

  if (connection.status === "connecting" && connection.connectingPromise) {
    return connection.connectingPromise
  }

  if (connection.client) {
    connection.client.stop()
    connection.client = null
  }

  connection.status = "connecting"
  delete connection.error
  delete connection.pairingRequestId
  for (const session of connection.sessions.values()) {
    host.emitSnapshot(connection, session)
  }

  const settled = Promise.withResolvers<OpenClawConnectResult>()
  connection.connectingPromise = settled.promise.finally(() => {
    connection.connectingPromise = null
  })

  // 本机 loopback 走 gateway-client/backend 默认身份（仅需 shared token）；
  // 远端必须声明为 WebChat 客户端并提供设备身份，交由 Gateway 走设备配对。
  const isDeviceAuth = connection.config.authMode === "device"

  // 探测底层 TCP 连通性，若遇瞬态 EHOSTUNREACH 则先等待网卡与路由表就绪（重试3次）
  try {
    const url = new URL(connection.config.gatewayUrl)
    const port = Number(url.port) || (url.protocol === "wss:" ? 443 : 80)
    const host = url.hostname

    // 对非本机 loopback 地址做一次 TCP 预检重试守卫
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      await new Promise<void>((resolve) => {
        let attempts = 0
        const probe = (): void => {
          attempts += 1
          const socket = net.connect({ host, port })
          socket.once("connect", () => {
            socket.end()
            resolve()
          })
          socket.once("error", (err) => {
            socket.destroy()
            if (attempts < 3 && /EHOSTUNREACH|ECONNREFUSED|timed? ?out/i.test(err.message)) {
              setTimeout(probe, 300)
            } else {
              // 不阻断流程，交由 GatewayClient 处理
              resolve()
            }
          })
        }
        probe()
      })
    }
  } catch {
    // url 解析失败交由 GatewayClient 处理
  }

  const client = new GatewayClient({
    url: connection.config.gatewayUrl,
    ...(connection.config.token ? { token: connection.config.token } : {}),
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    ...(isDeviceAuth ? { clientName: "openclaw-macos", mode: "ui" } : {}),
    role: "operator",
    scopes: OPERATOR_SCOPES,
    caps: CLIENT_CAPS,
    clientVersion: "0.1.0",
    hostDeps: buildOpenClawHostDeps(instanceId),
    onHelloOk: () => {
      if (connection.client !== client) return
      if (connectTimer) clearTimeout(connectTimer)
      if (connection.retryTimer) {
        clearTimeout(connection.retryTimer)
        connection.retryTimer = null
      }
      connection.retryCount = 0
      console.log(`[OpenClaw] Connected to instance ${instanceId}`)
      connection.status = "connected"
      delete connection.error
      delete connection.pairingRequestId
      for (const session of connection.sessions.values()) {
        // 重连后重新水合历史并重建订阅。
        session.hydrated = false
        session.subscribed = false
        host.emitSnapshot(connection, session)
      }
      settled.resolve({ status: "connected" })
    },
    onConnectError: (error) => {
      if (connection.client !== client) return
      if (connectTimer) clearTimeout(connectTimer)
      const info = parseConnectError(error)
      console.error(`[OpenClaw] Connect error for instance ${instanceId}:`, error)
      connection.status = info.status
      connection.error = info.message
      if (info.pairingRequestId) connection.pairingRequestId = info.pairingRequestId
      for (const session of connection.sessions.values()) {
        host.emitSnapshot(connection, session)
      }
      settled.resolve({
        status: info.status,
        error: info.message,
        ...(info.pairingRequestId ? { pairingRequestId: info.pairingRequestId } : {}),
      })

      // 网络层不可达/拒绝/超时等瞬态故障交由统一重连调度（指数退避）。
      if (/EHOSTUNREACH|ECONNREFUSED|ENOTFOUND|timed? ?out/i.test(info.message)) {
        scheduleReconnect(host, connection)
      }
    },
    onEvent: (event) => host.handleEvent(connection, event),
    onClose: (code, reason) => {
      // 已被替换或显式断开（connection.client 不再指向本客户端）时忽略。
      if (connection.client !== client) return
      if (connection.status === "connected" || connection.status === "connecting") {
        connection.status = "disconnected"
        connection.error = `Connection closed (${code})${reason ? `: ${reason}` : ""}`
        for (const session of connection.sessions.values()) {
          host.emitSnapshot(connection, session)
        }
        scheduleReconnect(host, connection)
      }
    },
  })

  // 连接握手安全超时（8秒），避免网络不可达/丢包导致一直挂起
  let connectTimer: NodeJS.Timeout | null = setTimeout(() => {
    connectTimer = null
    if (connection.status === "connecting") {
      const errorMsg = `Connection to OpenClaw gateway timed out (${connection.config.gatewayUrl})`
      connection.status = "error"
      connection.error = errorMsg
      for (const session of connection.sessions.values()) {
        host.emitSnapshot(connection, session)
      }
      settled.resolve({ status: "error", error: errorMsg })
      connection.client?.stop()
      scheduleReconnect(host, connection)
    }
  }, 8000)

  connection.client = client
  try {
    client.start()
  } catch (error) {
    if (connectTimer) clearTimeout(connectTimer)
    const info = parseConnectError(error instanceof Error ? error : new Error(String(error)))
    connection.status = info.status
    connection.error = info.message
    settled.resolve({ status: info.status, error: info.message })
  }

  return settled.promise
}

/**
 * 非预期中断（网络抖动、对端重启、握手超时）后按指数退避自动重连（1s 起步，上限 30s）。
 * 连接成功、实例被显式断开或移除时终止。
 */
export function scheduleReconnect(
  host: OpenClawClientManagerHost,
  connection: InstanceConnection,
): void {
  if (connection.retryTimer) return
  if (!host.connections.has(connection.instanceId)) return

  connection.retryCount = (connection.retryCount ?? 0) + 1
  const delay = Math.min(1000 * 2 ** (connection.retryCount - 1), 30_000)
  console.log(
    `[OpenClaw] Reconnecting instance ${connection.instanceId} in ${Math.round(delay / 1000)}s ` +
      `(attempt ${connection.retryCount})...`,
  )
  connection.retryTimer = setTimeout(() => {
    connection.retryTimer = null
    if (!host.connections.has(connection.instanceId)) return
    if (connection.status === "error" || connection.status === "disconnected") {
      void connect(host, connection.instanceId)
    }
  }, delay)
}

/**
 * 断开指定实例连接并清理会话状态。
 */
export async function disconnect(
  host: OpenClawClientManagerHost,
  instanceId: string,
): Promise<void> {
  const connection = host.connections.get(instanceId)
  if (!connection) return

  if (connection.retryTimer) {
    clearTimeout(connection.retryTimer)
    connection.retryTimer = null
  }

  connection.client?.stop()
  connection.client = null
  connection.status = "disconnected"
  delete connection.error
  delete connection.pairingRequestId
  connection.sessions.clear()
  host.connections.delete(instanceId)
}

// 释放所有连接。
export function disposeAll(host: OpenClawClientManagerHost): void {
  for (const connection of host.connections.values()) {
    if (connection.retryTimer) {
      clearTimeout(connection.retryTimer)
      connection.retryTimer = null
    }
    connection.client?.stop()
    connection.client = null
  }
  host.connections.clear()
}
