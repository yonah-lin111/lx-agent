import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { isDevRuntime, resolveDevUserDataDir } from "@/lib/runtimeMode"

// process.defaultApp 原描述符（vitest 下通常不存在），测试后恢复现场。
const defaultAppDescriptor = Object.getOwnPropertyDescriptor(process, "defaultApp")

// 覆盖 process.defaultApp 模拟开发态/打包态。
const setDefaultApp = (value: boolean): void => {
  Object.defineProperty(process, "defaultApp", { value, configurable: true })
}

afterEach(() => {
  if (defaultAppDescriptor) {
    Object.defineProperty(process, "defaultApp", defaultAppDescriptor)
  } else {
    Reflect.deleteProperty(process, "defaultApp")
  }
})

describe("isDevRuntime", () => {
  it("process.defaultApp 为 true 时判定为开发态", () => {
    setDefaultApp(true)
    expect(isDevRuntime()).toBe(true)
  })

  it("process.defaultApp 为 undefined 时判定为非开发态（打包态）", () => {
    Reflect.deleteProperty(process, "defaultApp")
    expect(isDevRuntime()).toBe(false)
  })
})

describe("resolveDevUserDataDir", () => {
  it("解析 appData 根下的独立 dev userData 目录", () => {
    expect(resolveDevUserDataDir("/app-data")).toBe(join("/app-data", "lx-agent-dev"))
  })
})
