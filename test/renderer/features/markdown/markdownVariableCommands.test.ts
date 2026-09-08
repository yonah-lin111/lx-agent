import { describe, expect, it } from "vitest"
import {
  filterMarkdownVariables,
  formatVariablePreview,
  getMarkdownVariableTrigger,
  getVariableTag,
  isInsideMarkdownFrontmatter,
  parseMarkdownVariables,
  stripMarkdownFrontmatter,
} from "@/features/markdown/commands/markdownVariableCommands"

describe("Markdown 页面变量命令", () => {
  describe("parseMarkdownVariables", () => {
    it("解析标准 vars 字典中的变量", () => {
      const doc = `---
vars:
  core: @src/core/index.ts
  auth: @[refer-folder](/path/to/auth)
  rule: "请严格校验 JWT token"
  plain: '单引号内容'
---

# 正文
测试内容
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "core", value: "@src/core/index.ts" },
        { name: "auth", value: "@[refer-folder](/path/to/auth)" },
        { name: "rule", value: "请严格校验 JWT token" },
        { name: "plain", value: "单引号内容" },
      ])
    })

    it("解析多行块变量 (| 和 >)", () => {
      const doc = `---
vars:
  prompt: |
    - 第一条规则
    - 第二条规则
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        {
          name: "prompt",
          value: "- 第一条规则\n- 第二条规则",
        },
      ])
    })

    it("解析扁平 key: value 声明的 frontmatter", () => {
      const doc = `---
core: @src/core/index.ts
notice: 紧急通知
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "core", value: "@src/core/index.ts" },
        { name: "notice", value: "紧急通知" },
      ])
    })

    it("无 frontmatter 或空 frontmatter 时返回空数组", () => {
      expect(parseMarkdownVariables("# 纯标题")).toEqual([])
      expect(parseMarkdownVariables("---\n---\n")).toEqual([])
    })

    it("容忍输入过程中的半残行与注释", () => {
      const doc = `---
vars:
  # 注释行
  valid: 正常变量
  halfWritten
  another: 另一个
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "valid", value: "正常变量" },
        { name: "another", value: "另一个" },
      ])
    })

    it("支持解析自定义分组（如 temp:）并按点号路径输出变量", () => {
      const doc = `---
vars:
  api_host: "https://api.github.com/v1"
  project_root: "@/src/renderer/src"
temp:
  status: "111"
  title: 我的文档
  nested:
    deep_key: deep_val
flat_key: 顶层平级
---
`
      const result = parseMarkdownVariables(doc)
      expect(result).toEqual([
        { name: "api_host", value: "https://api.github.com/v1" },
        { name: "project_root", value: "@/src/renderer/src" },
        { name: "temp.status", value: "111" },
        { name: "temp.title", value: "我的文档" },
        { name: "temp.nested.deep_key", value: "deep_val" },
        { name: "flat_key", value: "顶层平级" },
      ])
    })
  })

  describe("getMarkdownVariableTrigger", () => {
    it("支持 $ 符号在行首或空白后触发", () => {
      expect(getMarkdownVariableTrigger("$")).toMatchObject({
        fragment: "",
        start: 0,
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("hello $co")).toMatchObject({
        fragment: "co",
        start: 6,
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("\n$api_core")).toMatchObject({
        fragment: "api_core",
        start: 1,
        triggerChar: "$",
      })
    })

    it("支持 ¥ 符号在行首或空白后触发（中英文 Shift+4 兼容）", () => {
      expect(getMarkdownVariableTrigger("¥")).toMatchObject({
        fragment: "",
        start: 0,
        triggerChar: "¥",
      })
      expect(getMarkdownVariableTrigger("测试 ¥rule")).toMatchObject({
        fragment: "rule",
        start: 3,
        triggerChar: "¥",
      })
    })

    it("单词内部无边界时不误触发", () => {
      expect(getMarkdownVariableTrigger("foo$bar")).toBeNull()
      expect(getMarkdownVariableTrigger("100$")).toBeNull()
    })

    it("标点符号后允许正常触发", () => {
      expect(getMarkdownVariableTrigger("提示：$core")).toMatchObject({
        fragment: "core",
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("输入 $temp.status")).toMatchObject({
        fragment: "temp.status",
        start: 3,
        triggerChar: "$",
      })
      expect(getMarkdownVariableTrigger("输入 ¥temp.")).toMatchObject({
        fragment: "temp.",
        start: 3,
        triggerChar: "¥",
      })
      expect(getMarkdownVariableTrigger("($auth")).toMatchObject({
        fragment: "auth",
        triggerChar: "$",
      })
    })

    it("处于代码围栏内时不触发", () => {
      const text = "```bash\necho $HOME"
      expect(getMarkdownVariableTrigger(text)).toBeNull()
    })

    it("处于文档顶部的 frontmatter 内时不触发", () => {
      const doc = "---\nvars:\n  a: $test\n---\n"
      const prefix = "---\nvars:\n  a: $test"
      expect(isInsideMarkdownFrontmatter(doc, prefix.length)).toBe(true)
      expect(getMarkdownVariableTrigger(prefix, doc)).toBeNull()
    })
  })

  describe("filterMarkdownVariables", () => {
    const vars = [
      { name: "core", value: "@src/core/index.ts" },
      { name: "auth_rule", value: "校验权限" },
      { name: "api_service", value: "@src/services/api.ts" },
    ]

    it("空查询返回全部候选", () => {
      expect(filterMarkdownVariables(vars, "")).toHaveLength(3)
    })

    it("按名称前缀与包含精确过滤排序", () => {
      expect(filterMarkdownVariables(vars, "core")).toEqual([vars[0]])
      expect(filterMarkdownVariables(vars, "api")).toEqual([vars[2]])
    })

    it("按预设内容包含匹配兜底", () => {
      expect(filterMarkdownVariables(vars, "权限")).toEqual([vars[1]])
    })
  })

  describe("stripMarkdownFrontmatter", () => {
    it("剥离顶部 frontmatter 并保留干净正文", () => {
      const doc = `---
vars:
  core: 123
---

# 标题
正文内容`
      expect(stripMarkdownFrontmatter(doc)).toBe("# 标题\n正文内容")
    })

    it("无 frontmatter 时原样返回", () => {
      const doc = "# 标题\n正文内容"
      expect(stripMarkdownFrontmatter(doc)).toBe(doc)
    })
  })

  describe("getVariableTag", () => {
    it("带命名空间前缀的点号变量提取第一段作为 tag", () => {
      expect(getVariableTag("temp.status")).toBe("temp")
      expect(getVariableTag("temp.nested.deep")).toBe("temp")
      expect(getVariableTag("env.prod.url")).toBe("env")
    })

    it("无前缀或默认 vars 下的平级变量返回 var", () => {
      expect(getVariableTag("reviewer_instruction")).toBe("var")
      expect(getVariableTag("api_host")).toBe("var")
    })
  })

  describe("formatVariablePreview", () => {
    it("多行文本展开为单行并使用三重双引号包裹", () => {
      const multi = `请作为资深架构师评审以下代码：\n1. 确保符合项目规范\n2. 检查性能`
      expect(formatVariablePreview(multi)).toBe(
        `"""请作为资深架构师评审以下代码： 1. 确保符合项目规范 2. 检查性能"""`,
      )
    })

    it("单行文本原样去除首尾空白输出", () => {
      expect(formatVariablePreview("  https://api.github.com  ")).toBe("https://api.github.com")
    })

    it("空文本返回空字符串", () => {
      expect(formatVariablePreview("")).toBe("")
      expect(formatVariablePreview("   \n  ")).toBe("")
    })
  })
})
