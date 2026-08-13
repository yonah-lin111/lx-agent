import { describe, expect, it } from "vitest"
import { LANGUAGE_EXTENSIONS } from "@/agent/lsp/language"

describe("LANGUAGE_EXTENSIONS", () => {
  it("TS/JS/JSON/HTML/CSS/Python 子集映射到位", () => {
    expect(LANGUAGE_EXTENSIONS[".ts"]).toBe("typescript")
    expect(LANGUAGE_EXTENSIONS[".tsx"]).toBe("typescriptreact")
    expect(LANGUAGE_EXTENSIONS[".js"]).toBe("javascript")
    expect(LANGUAGE_EXTENSIONS[".jsx"]).toBe("javascriptreact")
    expect(LANGUAGE_EXTENSIONS[".json"]).toBe("json")
    expect(LANGUAGE_EXTENSIONS[".html"]).toBe("html")
    expect(LANGUAGE_EXTENSIONS[".css"]).toBe("css")
    expect(LANGUAGE_EXTENSIONS[".scss"]).toBe("scss")
    expect(LANGUAGE_EXTENSIONS[".less"]).toBe("less")
    expect(LANGUAGE_EXTENSIONS[".py"]).toBe("python")
  })

  it("映射全量（含仅有扩展名映射、无启动器的语言）", () => {
    expect(LANGUAGE_EXTENSIONS[".go"]).toBe("go")
    expect(LANGUAGE_EXTENSIONS[".rs"]).toBe("rust")
    expect(LANGUAGE_EXTENSIONS[".java"]).toBe("java")
    expect(LANGUAGE_EXTENSIONS[".pyi"]).toBe("python")
    expect(LANGUAGE_EXTENSIONS[".c"]).toBe("c")
    expect(LANGUAGE_EXTENSIONS[".vue"]).toBe("vue")
  })

  it("未知扩展名不在映射表", () => {
    expect(LANGUAGE_EXTENSIONS[".xyz"]).toBeUndefined()
  })
})
