import { describe, expect, it } from "vitest"
import {
  buildAnnotationReviewMessage,
  buildIssueReviewMessage,
  buildIterateMessage,
  isMentionSafeSelector,
  sanitizeMentionText,
} from "@/features/agent/utils/designReviewComposer"
import type { DesignAnnotation, PreviewIssue } from "@/pages/front-design/types"

const createAnnotation = (overrides: Partial<DesignAnnotation> = {}): DesignAnnotation => ({
  id: "a1",
  selector: "[data-design-id=el-abc]",
  description: "button",
  comment: "改为高对比色",
  index: 1,
  createdAt: 0,
  ...overrides,
})

const createIssue = (overrides: Partial<PreviewIssue> = {}): PreviewIssue => ({
  id: "a11y:alt:body>img:nth-child(1)",
  group: "a11y",
  level: "warning",
  rule: "alt",
  message: "图片缺少 alt",
  instruction: "图片缺少 alt，请补充有意义的替代文本",
  selector: "body>img:nth-child(1)",
  count: 1,
  ...overrides,
})

describe("设计评审消息编译", () => {
  it("批注消息：头行 + 每条一行 mention", () => {
    const message = buildAnnotationReviewMessage({
      designId: "d1",
      annotations: [createAnnotation(), createAnnotation({ id: "a2", comment: "间距太挤" })],
      header: "按以下批注修改（共 2 处）：",
    })

    expect(message).toBe(
      [
        "按以下批注修改（共 2 处）：",
        "@design:d1#[data-design-id=el-abc] (button) 改为高对比色",
        "@design:d1#[data-design-id=el-abc] (button) 间距太挤",
      ].join("\n"),
    )
  })

  it("空批注被跳过，全部为空时返回空串", () => {
    expect(
      buildAnnotationReviewMessage({
        designId: "d1",
        annotations: [createAnnotation({ comment: "   " })],
        header: "头行",
      }),
    ).toBe("")
    expect(buildAnnotationReviewMessage({ designId: "d1", annotations: [], header: "头行" })).toBe(
      "",
    )
  })

  it("id 选择器剥离前缀井号，不产出 ## ", () => {
    const message = buildAnnotationReviewMessage({
      designId: "d1",
      annotations: [
        createAnnotation({ selector: "#buy-now", description: "button#buy-now", comment: "改色" }),
      ],
      header: "头行",
    })
    expect(message).toBe("头行\n@design:d1#buy-now (button#buy-now) 改色")
  })

  it("选择器含空白或括号时降级为编号说明行", () => {
    const message = buildAnnotationReviewMessage({
      designId: "d1",
      annotations: [
        createAnnotation({
          selector: "body > main > h1:nth-child(1)",
          description: "h1",
          comment: "字号加大",
        }),
      ],
      header: "头行",
    })

    expect(message).toBe("头行\n- body > main > h1:nth-child(1) 字号加大")
    expect(message).not.toContain("@design:d1#")
  })

  it("描述中的括号与换行被清洗，避免撑破 mention 分组", () => {
    const message = buildAnnotationReviewMessage({
      designId: "d1",
      annotations: [createAnnotation({ description: "button(主)\n次", comment: "改色" })],
      header: "头行",
    })
    expect(message).toContain("(button 主 次) 改色")
  })

  it("mention 选择器判定", () => {
    expect(isMentionSafeSelector("#submit")).toBe(true)
    expect(isMentionSafeSelector("[data-design-id=el-x]")).toBe(true)
    expect(isMentionSafeSelector("body>main>h1")).toBe(true)
    expect(isMentionSafeSelector("body > main")).toBe(false)
    expect(isMentionSafeSelector("h1:nth-child(2)")).toBe(false)
    expect(isMentionSafeSelector("")).toBe(false)
    expect(isMentionSafeSelector(undefined)).toBe(false)
  })

  it("mention 文本清洗去掉括号与多余空白", () => {
    expect(sanitizeMentionText("  a (b) \n c ")).toBe("a b c")
  })

  it("体检消息：设计级 mention + 编号清单带路径选择器", () => {
    const message = buildIssueReviewMessage({
      designId: "d1",
      title: "Login",
      issues: [
        createIssue(),
        createIssue({
          id: "a11y:lang:document",
          rule: "lang",
          selector: undefined,
          instruction: "页面 html 缺少 lang 属性，请补充语言声明",
        }),
      ],
      header: "按以下预览体检结果修复（共 2 项）：",
    })

    expect(message).toBe(
      [
        "@design:d1 (Login) 按以下预览体检结果修复（共 2 项）：",
        "1. `body>img:nth-child(1)` 图片缺少 alt，请补充有意义的替代文本",
        "2. 页面 html 缺少 lang 属性，请补充语言声明",
      ].join("\n"),
    )
  })

  it("体检消息：空列表返回空串，标题缺失时省略括号", () => {
    expect(buildIssueReviewMessage({ designId: "d1", title: "x", issues: [], header: "h" })).toBe(
      "",
    )
    const message = buildIssueReviewMessage({
      designId: "d1",
      title: "",
      issues: [createIssue()],
      header: "头行",
    })
    expect(message.startsWith("@design:d1 头行")).toBe(true)
  })

  it("快捷迭代消息：设计级 mention 带标题 + 指令，标题清洗括号与换行", () => {
    expect(
      buildIterateMessage({
        designId: "d1",
        title: "Login (v2)",
        instruction: "请补充空态、加载态、错误态与成功态",
      }),
    ).toBe("@design:d1 (Login v2) 请补充空态、加载态、错误态与成功态")
  })

  it("快捷迭代消息：标题缺失时省略括号，空 designId 或空指令返回空串", () => {
    const message = buildIterateMessage({
      designId: "d1",
      title: "",
      instruction: "  适配移动端  ",
    })
    expect(message).toBe("@design:d1 适配移动端")

    expect(buildIterateMessage({ designId: "", title: "x", instruction: "指令" })).toBe("")
    expect(buildIterateMessage({ designId: "d1", title: "x", instruction: "   " })).toBe("")
  })
})
