import { describe, expect, it } from "vitest"
import {
  createMarkdownTemplateFileReference,
  filterMarkdownTemplateFileCandidates,
  getMarkdownTemplateFileCandidates,
  getMarkdownTemplateFileTrigger,
  isMarkdownTemplateImagePath,
  type MarkdownTemplateFileCandidate,
} from "@/components/ui/LxMarkdown/commands/markdownTemplateFileCommands"

describe("模板块文件快捷输入命令", () => {
  it("识别光标前的裸片段触发", () => {
    expect(getMarkdownTemplateFileTrigger("lxmded")).toMatchObject({
      fragment: "lxmded",
      start: 0,
    })
    expect(getMarkdownTemplateFileTrigger("foo lxmded")).toMatchObject({
      fragment: "lxmded",
      start: 4,
    })
    expect(getMarkdownTemplateFileTrigger("&&& addTemplate\n- 位置: lxmded")).toMatchObject({
      fragment: "lxmded",
    })
    expect(getMarkdownTemplateFileTrigger("src/components")).toMatchObject({
      fragment: "src/components",
    })
    expect(getMarkdownTemplateFileTrigger("a/lx")).toMatchObject({ fragment: "a/lx" })
  })

  it("只取末尾片段并忽略前置文本", () => {
    expect(getMarkdownTemplateFileTrigger("lxmded abc")).toMatchObject({ fragment: "abc" })
  })

  it("小于最小长度时不触发", () => {
    expect(getMarkdownTemplateFileTrigger(" l")).toBeNull()
    expect(getMarkdownTemplateFileTrigger(" a ")).toBeNull()
  })

  it("@ 前缀不触发，交给文件提及面板处理", () => {
    expect(getMarkdownTemplateFileTrigger("@lxmded")).toBeNull()
    expect(getMarkdownTemplateFileTrigger(" @lxmded")).toBeNull()
    expect(getMarkdownTemplateFileTrigger("a@lxmded")).toBeNull()
  })

  it("判断路径是否为图片", () => {
    expect(isMarkdownTemplateImagePath("a.png")).toBe(true)
    expect(isMarkdownTemplateImagePath("a.PNG")).toBe(true)
    expect(isMarkdownTemplateImagePath("a.svg")).toBe(true)
    expect(isMarkdownTemplateImagePath("a.webp")).toBe(true)
    expect(isMarkdownTemplateImagePath("a.tsx")).toBe(false)
    expect(isMarkdownTemplateImagePath("a")).toBe(false)
  })

  it("收集当前模板块正文中出现的文件引用候选并排除图片", () => {
    const content = [
      "- 参考: @src/LxMarkdownEditor.tsx",
      "- 位置: @[refer-file](/abs/a.ts)",
      "- 参考: @[refer-folder](/abs/src/components)",
      "- 项目: @[refer-project](/abs/proj)",
      "- 图片: @[refer-image](/abs/b.png)",
    ].join("\n")

    expect(getMarkdownTemplateFileCandidates(content)).toEqual([
      { path: "/abs/a.ts", isDirectory: false, kind: "referFile" },
      { path: "/abs/src/components", isDirectory: true, kind: "referFolder" },
      { path: "/abs/proj", isDirectory: true, kind: "referFolder" },
      { path: "src/LxMarkdownEditor.tsx", isDirectory: false, kind: "currentMention" },
    ])
  })

  it("按引用根区分当前项目与引用文件夹的 @ 提及", () => {
    const content = ["- 当前: @src/a.ts", "- 引用: @/abs/shared/b.ts"].join("\n")

    expect(getMarkdownTemplateFileCandidates(content, ["/abs/shared"])).toEqual([
      { path: "src/a.ts", isDirectory: false, kind: "currentMention" },
      { path: "/abs/shared/b.ts", isDirectory: false, kind: "referenceMention" },
    ])
  })

  it("候选按名称/路径过滤并排序", () => {
    const candidates: MarkdownTemplateFileCandidate[] = [
      { path: "src/LxMarkdownEditor.tsx", isDirectory: false, kind: "currentMention" },
      { path: "src/components", isDirectory: true, kind: "referFolder" },
      { path: "/abs/other.ts", isDirectory: false, kind: "referFile" },
    ]

    expect(filterMarkdownTemplateFileCandidates(candidates, "lxmded")).toEqual([
      { path: "src/LxMarkdownEditor.tsx", isDirectory: false, kind: "currentMention" },
    ])
    expect(filterMarkdownTemplateFileCandidates(candidates, "comp")).toEqual([
      { path: "src/components", isDirectory: true, kind: "referFolder" },
    ])
    expect(filterMarkdownTemplateFileCandidates(candidates, "nope")).toEqual([])
    expect(filterMarkdownTemplateFileCandidates(candidates, "")).toHaveLength(3)
  })

  it("创建文件引用插入文本", () => {
    expect(
      createMarkdownTemplateFileReference({ path: "src/LxMarkdownEditor.tsx", isDirectory: false }),
    ).toBe("【LxMarkdownEditor.tsx】")
    expect(createMarkdownTemplateFileReference({ path: "a/b/c.ts", isDirectory: false })).toBe(
      "【c.ts】",
    )
  })

  it("创建文件夹引用插入文本并带斜杠", () => {
    expect(createMarkdownTemplateFileReference({ path: "src/components", isDirectory: true })).toBe(
      "【components/】",
    )
  })
})
