import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  clearEnvironmentCache,
  ENVIRONMENT_DEFINITIONS,
  extractEnvironmentVersion,
  getEnvironmentVersions,
  probeSingleEnvironment,
  setShellExecutorForTest,
} from "@/services/environmentService"

describe("environmentService", () => {
  beforeEach(() => {
    clearEnvironmentCache()
    setShellExecutorForTest(null)
  })

  describe("extractEnvironmentVersion", () => {
    it("正确提取常见版本的版本号", () => {
      expect(extractEnvironmentVersion("git version 2.43.0")).toBe("2.43.0")
      expect(extractEnvironmentVersion("v20.11.1")).toBe("20.11.1")
      expect(extractEnvironmentVersion("Python 3.12.2")).toBe("3.12.2")
      expect(extractEnvironmentVersion('openjdk version "21.0.2" 2024-01-16')).toBe("21.0.2")
      expect(extractEnvironmentVersion('java version "1.8.0_291"')).toBe("1.8.0_291")
    })

    it("空字符串或非法格式返回 null", () => {
      expect(extractEnvironmentVersion("")).toBeNull()
      expect(extractEnvironmentVersion("command not found")).toBeNull()
    })
  })

  describe("probeSingleEnvironment", () => {
    it("可执行文件存在且版本返回成功时返回 installed: true", async () => {
      const mockExec = vi.fn((cmd, _opts, callback) => {
        if (cmd.includes("which") || cmd.includes("where")) {
          callback(null, "/usr/local/bin/git\n", "")
        } else if (cmd.includes("--version")) {
          callback(null, "git version 2.43.0\n", "")
        } else {
          callback(new Error("not found"), "", "not found")
        }
      })
      setShellExecutorForTest(mockExec as any)

      const result = await probeSingleEnvironment(ENVIRONMENT_DEFINITIONS.git)
      expect(result.id).toBe("git")
      expect(result.installed).toBe(true)
      expect(result.version).toBe("2.43.0")
      expect(result.path).toBe("/usr/local/bin/git")
      expect(result.isRequired).toBe(true)
    })

    it("可执行文件不存在时返回 installed: false", async () => {
      const mockExec = vi.fn((_cmd, _opts, callback) => {
        callback(new Error("command not found"), "", "command not found")
      })
      setShellExecutorForTest(mockExec as any)

      const result = await probeSingleEnvironment(ENVIRONMENT_DEFINITIONS.java)
      expect(result.id).toBe("java")
      expect(result.installed).toBe(false)
      expect(result.version).toBeNull()
      expect(result.path).toBeNull()
      expect(result.isRequired).toBe(false)
    })
  })

  describe("getEnvironmentVersions", () => {
    it("探测全部 4 项环境并生效缓存", async () => {
      let callCount = 0
      const mockExec = vi.fn((cmd, _opts, callback) => {
        callCount++
        if (cmd.includes("which") || cmd.includes("where")) {
          callback(null, "/usr/bin/tool\n", "")
        } else {
          callback(null, "tool version 1.0.0\n", "")
        }
      })
      setShellExecutorForTest(mockExec as any)

      const firstCall = await getEnvironmentVersions()
      expect(firstCall).toHaveLength(4)
      expect(firstCall.map((e) => e.id)).toEqual(["git", "node", "python", "java"])
      const countAfterFirst = callCount
      expect(countAfterFirst).toBeGreaterThan(0)

      // 第二次调用应命中缓存，不再产生额外 exec 调用
      const secondCall = await getEnvironmentVersions({ force: false })
      expect(secondCall).toEqual(firstCall)
      expect(callCount).toBe(countAfterFirst)

      // force: true 应重新探测
      const thirdCall = await getEnvironmentVersions({ force: true })
      expect(thirdCall).toEqual(firstCall)
      expect(callCount).toBeGreaterThan(countAfterFirst)
    })
  })
})
