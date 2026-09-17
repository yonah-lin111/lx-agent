// RTK 过滤器单测：逐条校验压缩行为契约。

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ALL_RTK_FILTER_NAMES,
  compressToolOutputText,
  safeApplyFilter,
} from "@/agent/tokenSaver/rtk/applyFilter"
import { detectFilter } from "@/agent/tokenSaver/rtk/autodetect"
import { RTK_FILTER_NAMES } from "@/agent/tokenSaver/rtk/constants"
import { buildOutput } from "@/agent/tokenSaver/rtk/filters/buildOutput"
import { dedupLog } from "@/agent/tokenSaver/rtk/filters/dedupLog"
import { find } from "@/agent/tokenSaver/rtk/filters/find"
import { gitDiff } from "@/agent/tokenSaver/rtk/filters/gitDiff"
import { gitLog } from "@/agent/tokenSaver/rtk/filters/gitLog"
import { gitStatus } from "@/agent/tokenSaver/rtk/filters/gitStatus"
import { grep } from "@/agent/tokenSaver/rtk/filters/grep"
import { ls } from "@/agent/tokenSaver/rtk/filters/ls"
import { readNumbered } from "@/agent/tokenSaver/rtk/filters/readNumbered"
import { searchList } from "@/agent/tokenSaver/rtk/filters/searchList"
import { smartTruncate } from "@/agent/tokenSaver/rtk/filters/smartTruncate"
import { tree } from "@/agent/tokenSaver/rtk/filters/tree"
import { RTK_FILTERS } from "@/agent/tokenSaver/rtk/registry"

const makeLongDiff = (): string => {
  const lines = [
    "diff --git a/foo.js b/foo.js",
    "index abc..def 100644",
    "--- a/foo.js",
    "+++ b/foo.js",
    "@@ -1,3 +1,200 @@",
  ]
  for (let i = 0; i < 200; i++) lines.push(`+added line ${i} ${"x".repeat(20)}`)
  return lines.join("\n")
}

const makeGitStatus = (): string =>
  [
    "On branch main",
    "Your branch is up to date with 'origin/main'.",
    "",
    "Changes not staged for commit:",
    '  (use "git add <file>..." to update what will be committed)',
    "\tmodified:   src/a.js",
    "\tmodified:   src/b.js",
    "\tnew file:   src/c.js",
    "\tdeleted:    src/old.js",
    "",
    "Untracked files:",
    "\tnotes.txt",
    "",
    "no changes added to commit",
  ].join("\n")

const makeGrepOutput = (): string => {
  const lines: string[] = []
  for (let i = 1; i <= 40; i++) {
    lines.push(`src/foo.js:${i}:const x${i} = "some value here with padding text padding text"`)
  }
  for (let i = 1; i <= 10; i++) {
    lines.push(`src/bar.js:${i}:const y${i} = "another value here with padding padding padding"`)
  }
  return lines.join("\n")
}

const makeFindOutput = (): string => {
  const lines: string[] = []
  for (let i = 0; i < 30; i++) lines.push(`./src/a/${i}.js`)
  for (let i = 0; i < 20; i++) lines.push(`./src/b/${i}.js`)
  for (let i = 0; i < 5; i++) lines.push(`./top${i}.md`)
  return lines.join("\n")
}

const makeGitLogOneline = (): string =>
  ["abc1234 Add auth middleware", "def5678 Fix token refresh race", "fedcba9 Update docs"].join(
    "\n",
  )

const makeGitLogDefault = (): string =>
  [
    "commit abc1234def5678abc1234def5678abc1234def5",
    "Author: Dev One <dev1@example.com>",
    "Date:   Sun Jul 6 10:00:00 2026 +0700",
    "",
    "    Add auth middleware",
    "",
    "    More body detail should be dropped.",
    "    This is padding that consumes tokens.",
  ].join("\n")

const makeGitLogGraph = (): string =>
  [
    "* abc1234 Add auth middleware",
    "| * def5678 Fix token refresh race",
    "|/",
    "* fedcba9 Update docs",
  ].join("\n")

const makeGitLogGraphDefault = (): string =>
  [
    "*   commit abc1234def5678abc1234def5678abc1234def5",
    "|\\",
    "| * commit def5678abc1234def5678abc1234def5678abc1",
    "|/",
    "|",
    "* commit fedcba9abc1234fedcba9abc1234fedcba9abc1234",
    "Author: Dev One <dev1@example.com>",
    "Date:   Sun Jul 6 10:00:00 2026 +0700",
    "",
    "    Add auth middleware",
    "",
  ].join("\n")

describe("gitLog 过滤器", () => {
  it("压缩 git log --oneline 且不丢失提交主题", () => {
    const input = makeGitLogOneline()
    const out = gitLog(input)
    expect(out).toContain("abc1234")
    expect(out).toContain("Add auth middleware")
    expect(out.length).toBeLessThanOrEqual(input.length)
  })

  it("默认 git log 保留 commit 头与主题，丢弃正文细节", () => {
    const out = gitLog(makeGitLogDefault())
    expect(out).toContain("commit abc1234def5678abc1234def5678abc1234def5")
    expect(out).toContain("Add auth middleware")
    expect(out).not.toContain("More body detail should be dropped.")
  })

  it("剥离纯图形装饰但保留提交主题", () => {
    const out = gitLog(makeGitLogGraph())
    expect(out).toContain("abc1234 Add auth middleware")
    expect(out).toContain("def5678 Fix token refresh race")
    expect(out).not.toContain("|/")
  })

  it("空输入返回空串", () => {
    expect(gitLog("")).toBe("")
  })

  it("null/undefined 输入返回空串", () => {
    expect(gitLog(null as unknown as string)).toBe("")
    expect(gitLog(undefined as unknown as string)).toBe("")
  })

  it("处理 --graph 无 --oneline（图形前缀 commit 头）", () => {
    const out = gitLog(makeGitLogGraphDefault())
    expect(out).toContain("commit abc1234def5678abc1234def5678abc1234def5")
    expect(out).toContain("Add auth middleware")
    expect(out).not.toContain("|\\")
    expect(out).not.toContain("|/")
  })

  it("超过 maxLines 时截断并报告跳过行数", () => {
    const lines: string[] = []
    for (let i = 0; i < 50; i++) lines.push(`commit ${String(i).padStart(40, "0")}`)
    const out = gitLog(lines.join("\n"), 20)
    const outLines = out.split("\n").filter((line) => line.length > 0)
    expect(outLines.length).toBeLessThanOrEqual(21)
    expect(out).toContain("more lines")
  })

  it("压缩后变长时返回原文", () => {
    const input = "abc\ndef"
    expect(gitLog(input, 10)).toBe(input)
  })
})

describe("RTK 过滤器", () => {
  it("gitDiff 截断超长 hunk 并保留文件头", () => {
    const input = makeLongDiff()
    const out = gitDiff(input, 500)
    expect(out).toContain("foo.js")
    expect(out).toContain("lines truncated")
    expect(out.length).toBeLessThan(input.length)
  })

  it("gitStatus 按类别聚合输出紧凑统计", () => {
    const input = makeGitStatus()
    const out = gitStatus(input)
    expect(out).toContain("* main")
    expect(out).toMatch(/~ Modified: \d+ files/)
    expect(out).toContain("src/a.js")
    expect(out.length).toBeLessThan(input.length)
  })

  it("grep 按文件分组并限制每文件条数", () => {
    const input = makeGrepOutput()
    const out = grep(input)
    expect(out).toContain("50 matches in 2F:")
    expect(out).toContain("[file] src/foo.js (40):")
    expect(out).toContain("[file] src/bar.js (10):")
    expect(out).toMatch(/\+\d+/)
    expect(out.length).toBeLessThan(input.length)
  })

  it("find 按父目录分组展示文件名", () => {
    const input = makeFindOutput()
    const out = find(input)
    expect(out).toContain("55 files in 3 dirs:")
    expect(out).toContain("./src/a/  (30)")
    expect(out).toContain("./src/b/  (20)")
    expect(out).toContain("./  (5)")
    expect(out.length).toBeLessThan(input.length)
  })

  it("dedupLog 折叠连续重复行", () => {
    const input = `${Array(20).fill("repeated log line A").join("\n")}\nunique\n${Array(10)
      .fill("another dup")
      .join("\n")}`
    const out = dedupLog(input)
    expect(out).toContain("repeated log line A")
    expect(out).toContain("duplicate lines")
    expect(out.length).toBeLessThan(input.length)
  })

  it("ls 去除权限列保留名称与大小并输出来源摘要", () => {
    const input = [
      "total 48",
      "drwxr-xr-x  2 user staff   64 Jan  1 12:00 .",
      "drwxr-xr-x  2 user staff   64 Jan  1 12:00 ..",
      "drwxr-xr-x  2 user staff   64 Jan  1 12:00 src",
      "-rw-r--r--  1 user staff 1234 Jan  1 12:00 Cargo.toml",
      "-rw-r--r--  1 user staff 5678 Jan  1 12:00 README.md",
    ].join("\n")
    const out = ls(input)
    expect(out).toContain("src/")
    expect(out).toContain("Cargo.toml")
    expect(out).toContain("1.2K")
    expect(out).toContain("5.5K")
    expect(out).not.toContain("drwx")
    expect(out).toContain("Summary: 2 files, 1 dirs")
  })

  it("ls 过滤噪声目录", () => {
    const input = [
      "total 8",
      "drwxr-xr-x  2 user staff 64 Jan  1 12:00 node_modules",
      "drwxr-xr-x  2 user staff 64 Jan  1 12:00 .git",
      "drwxr-xr-x  2 user staff 64 Jan  1 12:00 src",
      "-rw-r--r--  1 user staff 100 Jan  1 12:00 main.js",
    ].join("\n")
    const out = ls(input)
    expect(out).not.toContain("node_modules")
    expect(out).not.toContain(".git")
    expect(out).toContain("src/")
    expect(out).toContain("main.js")
  })

  it("tree 去掉摘要行保留结构", () => {
    const input = ".\n├── src\n│   └── main.rs\n└── Cargo.toml\n\n2 directories, 3 files\n"
    const out = tree(input)
    expect(out).not.toContain("directories")
    expect(out).toContain("├──")
    expect(out).toContain("main.rs")
  })

  it("smartTruncate 保留头尾折叠中部", () => {
    const input = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n")
    const out = smartTruncate(input)
    expect(out).toContain("line 0")
    expect(out).toContain("line 399")
    expect(out).toContain("lines truncated")
    expect(out.length).toBeLessThan(input.length)
  })

  it("smartTruncate 小输入原样返回", () => {
    const input = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n")
    expect(smartTruncate(input)).toBe(input)
  })

  it("readNumbered 压缩超长行号文件输出", () => {
    const lines: string[] = []
    for (let i = 1; i <= 400; i++) lines.push(`  ${i}|content ${i}`)
    const input = lines.join("\n")
    const out = readNumbered(input)
    expect(out).toContain("1|content 1")
    expect(out).toContain("400|content 400")
    expect(out).toContain("lines truncated")
    expect(out.length).toBeLessThan(input.length)
  })

  it("searchList 按父目录分组搜索结果", () => {
    const paths: string[] = []
    for (let i = 0; i < 30; i++) paths.push(`- src/a/f${i}.js`)
    for (let i = 0; i < 10; i++) paths.push(`- src/b/g${i}.js`)
    const input = ["Result of search in '/Users/x' (total 40 files):", ...paths].join("\n")
    const out = searchList(input)
    expect(out).toContain("Result of search in")
    expect(out).toContain("40 files in 2 dirs:")
    expect(out).toContain("src/a/ (30):")
    expect(out).toContain("src/b/ (10):")
    expect(out).toMatch(/\+\d+/)
    expect(out.length).toBeLessThan(input.length)
  })

  it("buildOutput 保留错误与摘要，折叠编译噪音", () => {
    const lines: string[] = []
    for (let i = 0; i < 50; i++) lines.push(`Compiling crate${i} v0.1.0`)
    lines.push("warning: unused variable `x`")
    lines.push("    --> src/main.rs:10:5")
    lines.push("ERROR: build failed")
    lines.push("    Finished release [optimized] target(s) in 12.34s")
    const out = buildOutput(lines.join("\n"))
    expect(out).toContain("Compiled 50 packages")
    expect(out).toContain("ERROR: build failed")
    expect(out).toContain("Finished release")
    expect(out).not.toContain("Compiling crate49")
    expect(out.length).toBeLessThan(lines.join("\n").length)
  })
})

describe("detectFilter", () => {
  it("探测 git diff", () => {
    expect(detectFilter("diff --git a/x b/x\n@@ -1 +1 @@\n+a")).toBe(RTK_FILTER_NAMES.GIT_DIFF)
  })

  it("探测 git status", () => {
    expect(detectFilter("On branch main\n  modified:   x.js\n")).toBe(RTK_FILTER_NAMES.GIT_STATUS)
  })

  it("探测 grep", () => {
    expect(detectFilter("a.js:1:hello\nb.js:2:world\nc.js:3:foo")).toBe(RTK_FILTER_NAMES.GREP)
  })

  it("探测 find", () => {
    expect(detectFilter("./a/b.js\n./a/c.js\n./a/d.js")).toBe(RTK_FILTER_NAMES.FIND)
  })

  it("通过 commit 头探测 git log", () => {
    const input = [
      "commit abc1234def5678abc1234def5678abc1234def5",
      "Author: Dev One <dev1@example.com>",
      "Date:   Sun Jul 6 10:00:00 2026 +0700",
      "",
      "    Add auth middleware",
    ].join("\n")
    expect(detectFilter(input)).toBe(RTK_FILTER_NAMES.GIT_LOG)
  })

  it("通用文本回退 dedup-log", () => {
    expect(detectFilter("line1\nline2\nline3\nline4\nline5\nline6\n")).toBe(
      RTK_FILTER_NAMES.DEDUP_LOG,
    )
  })

  it("通过 box-drawing 探测 tree", () => {
    expect(detectFilter(".\n├── src\n│   └── main.rs\n└── Cargo.toml\n")).toBe(
      RTK_FILTER_NAMES.TREE,
    )
  })

  it("通过 total 与权限行探测 ls", () => {
    const input = [
      "total 48",
      "drwxr-xr-x  2 user staff   64 Jan  1 12:00 src",
      "-rw-r--r--  1 user staff 1234 Jan  1 12:00 main.js",
      "-rw-r--r--  1 user staff 5678 Jan  1 12:00 README.md",
    ].join("\n")
    expect(detectFilter(input)).toBe(RTK_FILTER_NAMES.LS)
  })

  it("探测 Cursor 搜索结果列表", () => {
    const input = "Result of search in '/x' (total 3 files):\n- a/b.js\n- a/c.js\n- a/d.js"
    expect(detectFilter(input)).toBe(RTK_FILTER_NAMES.SEARCH_LIST)
  })

  it("过短输入不触发任何过滤器", () => {
    expect(detectFilter("diff --git a/x b/x\n@@ -1 +1 @@\n+a")).toBe(RTK_FILTER_NAMES.GIT_DIFF)
    expect(detectFilter("hello")).toBeNull()
  })
})

describe("safeApplyFilter 与 compressToolOutputText", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("过滤器抛异常时返回原文", () => {
    const original = RTK_FILTERS[RTK_FILTER_NAMES.GREP]
    RTK_FILTERS[RTK_FILTER_NAMES.GREP] = () => {
      throw new Error("boom")
    }
    try {
      expect(safeApplyFilter(RTK_FILTER_NAMES.GREP, "a.js:1:hello")).toBe("a.js:1:hello")
      expect(compressToolOutputText(makeGrepOutput()).text).toBe(makeGrepOutput())
    } finally {
      RTK_FILTERS[RTK_FILTER_NAMES.GREP] = original
    }
  })

  it("低于最小压缩阈值不处理", () => {
    const small = "diff --git a/x b/x\n@@ -1 +1 @@\n+a"
    expect(compressToolOutputText(small).text).toBe(small)
  })

  it("压缩后无收益时返回原文", () => {
    const input = "a".repeat(1000)
    expect(compressToolOutputText(input).text).toBe(input)
  })

  it("全部过滤器名称均可命中注册表", () => {
    for (const name of ALL_RTK_FILTER_NAMES) {
      expect(typeof RTK_FILTERS[name]).toBe("function")
    }
  })
})
