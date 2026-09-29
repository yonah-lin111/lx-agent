import {
  DEFAULT_GAME_KEYMAP,
  GAME_KEY_ACTIONS,
  GAME_KEY_CODE_TABLE,
  normalizeGameKeymap,
  resolveGameKeymap,
  resolveGameKeymapCodes,
} from "@shared/contracts/game"
import { describe, expect, it } from "vitest"

describe("游戏键位契约", () => {
  it("默认键位覆盖全部动作，且都在可选键表内", () => {
    expect(Object.keys(DEFAULT_GAME_KEYMAP).sort()).toEqual([...GAME_KEY_ACTIONS].sort())

    for (const action of GAME_KEY_ACTIONS) {
      expect(GAME_KEY_CODE_TABLE[DEFAULT_GAME_KEYMAP[action]]).toBeTypeOf("number")
    }
  })

  it("默认键位解析为与历史默认一致的键值", () => {
    expect(resolveGameKeymapCodes(null)).toEqual({
      up: 87,
      down: 83,
      left: 65,
      right: 68,
      a: 74,
      b: 75,
      l: 81,
      r: 69,
      start: 13,
      select: 8,
      turboA: 85,
      turboB: 73,
      speed: 9,
      pause: 27,
    })
  })

  it("resolveGameKeymap 合并覆盖并回退默认", () => {
    const resolved = resolveGameKeymap({ a: "KeyX" })

    expect(resolved.a).toBe("KeyX")
    expect(resolved.up).toBe("KeyW")
    expect(Object.keys(resolved).sort()).toEqual([...GAME_KEY_ACTIONS].sort())
  })

  it("normalizeGameKeymap 接受合法覆盖，空对象归一为 null", () => {
    expect(normalizeGameKeymap(null)).toBeNull()
    expect(normalizeGameKeymap(undefined)).toBeNull()
    expect(normalizeGameKeymap({})).toBeNull()
    expect(normalizeGameKeymap({ a: "KeyX", speed: "F5" })).toEqual({ a: "KeyX", speed: "F5" })
  })

  it("normalizeGameKeymap 拒绝未知动作、未知按键与非法值", () => {
    expect(() => normalizeGameKeymap({ nope: "KeyX" })).toThrow("INVALID_GAME_INPUT")
    expect(() => normalizeGameKeymap({ a: "KeyNope" })).toThrow("INVALID_GAME_INPUT")
    expect(() => normalizeGameKeymap({ a: 74 })).toThrow("INVALID_GAME_INPUT")
    expect(() => normalizeGameKeymap([])).toThrow("INVALID_GAME_INPUT")
    expect(() => normalizeGameKeymap("KeyA")).toThrow("INVALID_GAME_INPUT")
  })
})
