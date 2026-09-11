// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { projectApi } from "@/features/project/api/projectApi"
import { ReferencedFolderCommandMenu } from "@/features/project/components/ReferencedFolderCommandMenu"

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    searchReferencedFiles: vi.fn(),
  },
}))

const mockedApi = vi.mocked(projectApi)

const writeText = vi.fn().mockResolvedValue(undefined)

describe("ReferencedFolderCommandMenu 鼠标点选交互", () => {
  beforeEach(() => {
    mockedApi.searchReferencedFiles.mockReset()
    mockedApi.searchReferencedFiles.mockResolvedValue([
      { path: "/folder/a.ts", isDirectory: false, projectPath: "/repo" },
      { path: "/folder/sub", isDirectory: true, projectPath: "/repo" },
    ])
    writeText.mockClear()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
  })

  afterEach(() => {
    cleanup()
  })

  it("点击文件行直接复制引用文本", async () => {
    render(
      <ReferencedFolderCommandMenu
        folderPath="/folder"
        position={{ top: 0, left: 0 }}
        onClose={vi.fn()}
      />,
    )

    const option = await screen.findByRole("option", { name: /a\.ts/ })
    fireEvent.mouseDown(option)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("@[refer-file](/folder/a.ts)")
    })
  })

  it("点击行内复制按钮只复制一次（不触发行点击）", async () => {
    render(
      <ReferencedFolderCommandMenu
        folderPath="/folder"
        position={{ top: 0, left: 0 }}
        onClose={vi.fn()}
      />,
    )

    const option = await screen.findByRole("option", { name: /a\.ts/ })
    const copyButton = option.querySelector("button")
    expect(copyButton).not.toBeNull()

    fireEvent.mouseDown(copyButton!)
    fireEvent.click(copyButton!)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
    })
    expect(writeText).toHaveBeenCalledWith("@[refer-file](/folder/a.ts)")
  })
})
