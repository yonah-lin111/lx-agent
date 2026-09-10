import { createHash, createPublicKey, verify } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  appDataRoot: "",
}))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getAppDataRoot: () => holder.appDataRoot,
  }
})

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex")

describe("OpenClaw device auth", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "openclaw-device-test-"))
    holder.appDataRoot = tmpDir
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("生成一次设备身份后保持稳定并落盘", async () => {
    const { buildOpenClawHostDeps } = await import("@/services/openclaw/openclawDeviceAuth")
    const deps = buildOpenClawHostDeps("local")

    const first = deps.loadOrCreateDeviceIdentity?.()
    const second = deps.loadOrCreateDeviceIdentity?.()

    expect(first).toBeTruthy()
    expect(second).toEqual(first)
    expect(existsSync(join(tmpDir, "openclaw-device.json"))).toBe(true)

    // 重新构造 hostDeps（模拟重启）后仍读取同一身份。
    const reopened = buildOpenClawHostDeps("local").loadOrCreateDeviceIdentity?.()
    expect(reopened?.deviceId).toBe(first?.deviceId)
    expect(reopened?.publicKeyPem).toBe(first?.publicKeyPem)
  })

  it("deviceId 为原始 Ed25519 公钥的 sha256 十六进制", async () => {
    const { buildOpenClawHostDeps } = await import("@/services/openclaw/openclawDeviceAuth")
    const identity = buildOpenClawHostDeps("local").loadOrCreateDeviceIdentity?.()
    if (!identity) throw new Error("identity missing")

    const der = Buffer.from(
      identity.publicKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
      "base64",
    )
    expect(der.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)).toBe(true)

    const raw = der.subarray(ED25519_SPKI_PREFIX.length)
    expect(raw).toHaveLength(32)
    expect(identity.deviceId).toBe(createHash("sha256").update(raw).digest("hex"))
    expect(identity.deviceId).toMatch(/^[a-f0-9]{64}$/)
  })

  it("公钥以原始 32 字节的 base64url 形式导出", async () => {
    const { buildOpenClawHostDeps } = await import("@/services/openclaw/openclawDeviceAuth")
    const deps = buildOpenClawHostDeps("local")
    const identity = deps.loadOrCreateDeviceIdentity?.()
    if (!identity) throw new Error("identity missing")

    const rawBase64Url = deps.publicKeyRawBase64UrlFromPem?.(identity.publicKeyPem)
    expect(Buffer.from(rawBase64Url ?? "", "base64url")).toHaveLength(32)
  })

  it("签名可用对应公钥验证", async () => {
    const { buildOpenClawHostDeps } = await import("@/services/openclaw/openclawDeviceAuth")
    const deps = buildOpenClawHostDeps("local")
    const identity = deps.loadOrCreateDeviceIdentity?.()
    if (!identity) throw new Error("identity missing")

    const payload = "v1|device|challenge-nonce|1737264000000"
    const signature = deps.signDevicePayload?.(identity.privateKeyPem, payload)
    expect(signature).toBeTruthy()

    const valid = verify(
      null,
      Buffer.from(payload, "utf8"),
      createPublicKey(identity.publicKeyPem),
      Buffer.from(signature ?? "", "base64url"),
    )
    expect(valid).toBe(true)
  })

  it("device token 按实例独立存取与清除", async () => {
    const { buildOpenClawHostDeps } = await import("@/services/openclaw/openclawDeviceAuth")
    const local = buildOpenClawHostDeps("local")
    const cloud = buildOpenClawHostDeps("cloud")

    // 先建立设备身份，验证写入 token 不会覆盖身份节点。
    local.loadOrCreateDeviceIdentity?.()

    expect(local.loadDeviceAuthToken?.({ deviceId: "d1", role: "operator" })).toBeNull()

    local.storeDeviceAuthToken?.({
      deviceId: "d1",
      role: "operator",
      token: "token-local",
      scopes: ["operator.read"],
    })
    cloud.storeDeviceAuthToken?.({
      deviceId: "d1",
      role: "operator",
      token: "token-cloud",
      scopes: ["operator.read", "operator.write"],
    })

    expect(local.loadDeviceAuthToken?.({ deviceId: "d1", role: "operator" })).toEqual({
      token: "token-local",
      scopes: ["operator.read"],
    })
    expect(cloud.loadDeviceAuthToken?.({ deviceId: "d1", role: "operator" })).toEqual({
      token: "token-cloud",
      scopes: ["operator.read", "operator.write"],
    })

    local.clearDeviceAuthToken?.({ deviceId: "d1", role: "operator" })
    expect(local.loadDeviceAuthToken?.({ deviceId: "d1", role: "operator" })).toBeNull()
    expect(cloud.loadDeviceAuthToken?.({ deviceId: "d1", role: "operator" })).not.toBeNull()

    const stored = JSON.parse(readFileSync(join(tmpDir, "openclaw-device.json"), "utf8")) as {
      identity?: { deviceId?: string }
    }
    expect(stored.identity?.deviceId).toMatch(/^[a-f0-9]{64}$/)
  })
})
