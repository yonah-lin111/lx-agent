// @vitest-environment jsdom

import type { OpenClawAttachmentFile, OpenClawChatMessage } from "@shared/contracts/openclaw"
import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenClawMessageList } from "@/features/openclaw/components/OpenClawMessageList"
import type { OfficeTimelineMessage } from "@/features/openclaw/hooks/useOpenClawOffice"

const agents = [{ agentId: "lily", name: "Lily", accent: "#ff6b6b" }]

const userMessage = (files?: OpenClawAttachmentFile[]): OpenClawChatMessage => ({
  id: "u1",
  role: "user",
  content: "look at this",
  timestamp: 1000,
  status: "completed",
  ...(files ? { files } : {}),
})

const renderTimeline = (message: OpenClawChatMessage): ReturnType<typeof render> => {
  const timeline: OfficeTimelineMessage[] = [{ agentId: "lily", message }]
  return render(<OpenClawMessageList timeline={timeline} agents={agents} />)
}

describe("OpenClaw 用户消息附件展示", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = (): void => undefined
        unobserve = (): void => undefined
        disconnect = (): void => undefined
      },
    )
  })

  afterEach(() => {
    cleanup()
  })

  it("携带附件的用户消息渲染本地图片缩略图", () => {
    renderTimeline(
      userMessage([{ name: "photo.png", path: "/mock/photo.png", type: "image", sizeBytes: 2048 }]),
    )

    const images = document.querySelectorAll('img[src^="lx-image://local"]')
    expect(images).toHaveLength(1)
    expect(images[0]?.getAttribute("src")).toBe("lx-image://local/mock/photo.png")
  })

  it("无附件的用户消息不渲染附件容器", () => {
    renderTimeline(userMessage())

    expect(document.querySelector(".agent-message-file-image")).toBeNull()
    expect(document.querySelector(".agent-message-file-item")).toBeNull()
  })
})
