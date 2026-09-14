import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

// 设置页控件尺寸统一使用组件缺省：LxInput 与 LxSelect 禁止显式 size 覆盖。
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const settingsDirs = ["src/renderer/src/pages/settings", "src/renderer/src/features/settings"].map(
  (relativePath) => path.join(repoRoot, relativePath),
)

const collectFiles = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (/\.tsx$/.test(entry.name)) out.push(full)
  }
  return out
}

// 组件标签与 size 属性按行追踪；仅约束 LxInput / LxSelect 两类控件。
const COMPONENT_PATTERN = /<(LxInput|LxSelect|LxIconButton|LxTag|LxNavItem|LxCheckbox|LxRadio)\b/
const SIZE_PATTERN = /size="([a-z]+)"/
const TARGET_COMPONENTS = new Set(["LxInput", "LxSelect"])

const collectViolations = (files: string[]): string[] => {
  const violations: string[] = []
  for (const file of files) {
    let lastComponent = ""
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        lastComponent = COMPONENT_PATTERN.exec(line)?.[1] ?? lastComponent
        const size = SIZE_PATTERN.exec(line)?.[1]
        if (size && TARGET_COMPONENTS.has(lastComponent)) {
          violations.push(
            `${path.relative(repoRoot, file)}:${index + 1} <${lastComponent}> size="${size}"`,
          )
        }
      })
  }
  return violations
}

describe("设置页控件尺寸缺省", () => {
  it("LxInput 与 LxSelect 不显式覆盖 size，统一使用组件默认尺寸", () => {
    const files = settingsDirs.flatMap((dir) => collectFiles(dir))
    expect(collectViolations(files)).toEqual([])
  })
})
