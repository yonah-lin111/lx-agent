import { createHash, createPrivateKey, generateKeyPairSync, sign } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { DeviceIdentity, GatewayClientHostDeps } from "@openclaw/gateway-client"
import { getAppDataRoot } from "@/paths"

// Ed25519 SPKI DER 前缀：前 12 字节固定，其后 32 字节为原始公钥。
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

// 设备身份与 device token 的落盘文件（明文，与 ~/.lx/config.json 同目录同策略）。
const getDeviceStorePath = (): string => join(getAppDataRoot(), "openclaw-device.json")

// 持久化的设备身份。
interface StoredIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

// 每个实例（Gateway）一条已签发的 device token。
interface StoredToken {
  token: string
  scopes: string[]
}

interface DeviceStore {
  identity?: StoredIdentity
  tokens?: Record<string, StoredToken>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// 从 SPKI PEM 中取出原始 Ed25519 公钥字节。
const deriveRawPublicKey = (publicKeyPem: string): Buffer => {
  const der = Buffer.from(
    publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
    "base64",
  )
  if (!der.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    throw new Error("Unsupported Ed25519 public key encoding")
  }
  return der.subarray(ED25519_SPKI_PREFIX.length)
}

// 设备 id = 原始公钥的 sha256（64 位小写十六进制）。
const deriveDeviceId = (publicKeyPem: string): string =>
  createHash("sha256").update(deriveRawPublicKey(publicKeyPem)).digest("hex")

const readStore = (): DeviceStore => {
  if (!existsSync(getDeviceStorePath())) return {}
  try {
    const parsed = JSON.parse(readFileSync(getDeviceStorePath(), "utf8")) as unknown
    return isRecord(parsed) ? (parsed as DeviceStore) : {}
  } catch {
    return {}
  }
}

const writeStore = (store: DeviceStore): void => {
  const directory = dirname(getDeviceStorePath())
  mkdirSync(directory, { recursive: true })
  const temporaryPath = `${getDeviceStorePath()}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  })
  renameSync(temporaryPath, getDeviceStorePath())
}

const parseStoredIdentity = (raw: unknown): StoredIdentity | null => {
  if (!isRecord(raw)) return null
  const { deviceId, publicKeyPem, privateKeyPem } = raw
  if (
    typeof deviceId !== "string" ||
    typeof publicKeyPem !== "string" ||
    typeof privateKeyPem !== "string"
  ) {
    return null
  }
  return { deviceId, publicKeyPem, privateKeyPem }
}

// 读取已有设备身份；不存在则生成并持久化。
const loadOrCreateIdentity = (): DeviceIdentity => {
  const store = readStore()
  const stored = parseStoredIdentity(store.identity)
  if (stored && deriveDeviceId(stored.publicKeyPem) === stored.deviceId) {
    return stored
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString()
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const identity: StoredIdentity = {
    deviceId: deriveDeviceId(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  }
  writeStore({ ...store, identity })
  return identity
}

/**
 * 构造 GatewayClient 所需的宿主依赖：设备身份、签名回调与 device token 存取。
 *
 * device token 按实例（Gateway）分别持久化，与 OpenClaw 的 per-gateway 语义一致。
 */
export const buildOpenClawHostDeps = (instanceId: string): GatewayClientHostDeps => ({
  loadOrCreateDeviceIdentity: () => loadOrCreateIdentity(),
  signDevicePayload: (privateKeyPem, payload) =>
    sign(null, Buffer.from(payload, "utf8"), createPrivateKey(privateKeyPem)).toString("base64url"),
  publicKeyRawBase64UrlFromPem: (publicKeyPem) =>
    deriveRawPublicKey(publicKeyPem).toString("base64url"),
  loadDeviceAuthToken: ({ deviceId }) => {
    const token = readStore().tokens?.[instanceId]
    if (!token || !deviceId) return null
    return { token: token.token, scopes: token.scopes }
  },
  storeDeviceAuthToken: ({ token, scopes }) => {
    const store = readStore()
    writeStore({
      ...store,
      tokens: { ...store.tokens, [instanceId]: { token, scopes } },
    })
  },
  clearDeviceAuthToken: () => {
    const store = readStore()
    if (!store.tokens?.[instanceId]) return
    const tokens = { ...store.tokens }
    delete tokens[instanceId]
    writeStore({ ...store, tokens })
  },
})
