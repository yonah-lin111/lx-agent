import { existsSync, readdirSync, readFileSync } from "node:fs"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url))
const TEXT_EXTENSIONS = new Set([".css", ".html", ".md", ".ts", ".tsx"])

const collectTextFiles = (dir: string): string[] => {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectTextFiles(path))
    } else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
      files.push(path)
    }
  }
  return files
}

const findResidualReferences = (relativeDirs: string[]): string[] =>
  relativeDirs.flatMap((relativeDir) =>
    collectTextFiles(join(REPO_ROOT, relativeDir)).filter((file) =>
      /minecraft/i.test(readFileSync(file, "utf8")),
    ),
  )

describe("主题重命名守卫", () => {
  it("生产代码与文档不得残留旧主题标识", () => {
    expect(findResidualReferences(["src", "docs"])).toEqual([])
  })

  it("像素主题目录已就位，旧主题目录已移除", () => {
    const themesDir = join(REPO_ROOT, "src/renderer/src/styles/themes")
    expect(existsSync(join(themesDir, "pixel/index.css"))).toBe(true)
    expect(existsSync(join(themesDir, "default.css"))).toBe(true)
    expect(existsSync(join(themesDir, "minecraft"))).toBe(false)
  })
})
