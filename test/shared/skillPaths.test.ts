import {
  validateSkillName,
  validateSkillPathSegment,
  validateSkillRelativePath,
} from "@shared/skillPaths"
import { describe, expect, it } from "vitest"

describe("validateSkillName", () => {
  it("接受规范名称并拒绝违规名称", () => {
    expect(validateSkillName("pdf-processing")).toBeNull()
    expect(validateSkillName("a1-b2")).toBeNull()

    expect(validateSkillName("")).not.toBeNull()
    expect(validateSkillName("Bad Name")).not.toBeNull()
    expect(validateSkillName("-lead")).not.toBeNull()
    expect(validateSkillName("trail-")).not.toBeNull()
    expect(validateSkillName("double--hyphen")).not.toBeNull()
    expect(validateSkillName("x".repeat(65))).not.toBeNull()
  })
})

describe("validateSkillRelativePath", () => {
  it("接受嵌套相对路径（含系统分隔符）", () => {
    expect(validateSkillRelativePath("references/api-errors.md")).toBeNull()
    expect(validateSkillRelativePath("references\\api-errors.md")).toBeNull()
    expect(validateSkillRelativePath("scripts/run.sh")).toBeNull()
  })

  it("拒绝绝对路径、父级逃逸与空路径", () => {
    expect(validateSkillRelativePath("")).not.toBeNull()
    expect(validateSkillRelativePath("/etc/passwd")).not.toBeNull()
    expect(validateSkillRelativePath("C:\\Windows\\system.ini")).not.toBeNull()
    expect(validateSkillRelativePath("../../outside.md")).not.toBeNull()
    expect(validateSkillRelativePath("references/../outside.md")).not.toBeNull()
  })

  it("拒绝跨平台非法字符、保留名与尾随点/空格", () => {
    expect(validateSkillRelativePath("references/a:b.md")).not.toBeNull()
    expect(validateSkillRelativePath("references/a?b.md")).not.toBeNull()
    expect(validateSkillRelativePath("CON.md")).not.toBeNull()
    expect(validateSkillRelativePath("references/aux.txt")).not.toBeNull()
    expect(validateSkillRelativePath("references/name. ")).not.toBeNull()
    expect(validateSkillRelativePath("references/name.")).not.toBeNull()
  })

  it("validateSkillPathSegment 拦截过长路径段", () => {
    expect(validateSkillPathSegment("a".repeat(121))).not.toBeNull()
    expect(validateSkillPathSegment("a".repeat(120))).toBeNull()
  })
})
