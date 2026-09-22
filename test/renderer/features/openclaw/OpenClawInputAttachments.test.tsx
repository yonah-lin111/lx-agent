// @vitest-environment jsdom

import type { OpenClawAttachmentFile } from "@shared/contracts/openclaw"
import { OPENCLAW_MAX_IMAGE_BYTES } from "@shared/contracts/openclaw"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OpenClawInput } from "@/features/openclaw/components/OpenClawInput"

const baseProps = {
  value: "",
  onChange: vi.fn(),
  onSend: vi.fn(),
  onStop: vi.fn(),
  candidates: [],
  onCommand: vi.fn(),
}

// jsdom 无法构造 FileList：用鸭子对象满足 `list.item(i)` 读取路径。
const createFileList = (files: File[]): FileList =>
  ({
    length: files.length,
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList

// jsdom 无法构造 DataTransfer：补齐 CodeMirror 默认粘贴处理所需的 getData。
const createClipboardData = (files: File[]): DataTransfer =>
  ({
    files,
    items: files.map((file) => ({ kind: "file", type: file.type })),
    types: [],
    getData: () => "",
  }) as unknown as DataTransfer

const renderInput = (
  props: {
    value?: string
    files?: OpenClawAttachmentFile[]
    onFilesChange?: (f: OpenClawAttachmentFile[]) => void
  } = {},
): ReturnType<typeof render> =>
  render(
    <OpenClawInput
      {...baseProps}
      files={props.files ?? []}
      onFilesChange={props.onFilesChange ?? vi.fn()}
      {...(props.value !== undefined ? { value: props.value } : {})}
    />,
  )

describe("OpenClawInput 附件", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = (): void => undefined
        unobserve = (): void => undefined
        disconnect = (): void => undefined
      },
    )
    window.api = {
      getPathForFile: vi.fn((file: File) => `/mock/${file.name}`),
    } as unknown as typeof window.api
  })

  afterEach(() => {
    cleanup()
  })

  it("选择图片文件后回调携带 path、大小与图片类型", () => {
    const onFilesChange = vi.fn()
    const { container } = renderInput({ onFilesChange })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()

    const file = { name: "photo.png", size: 2048, type: "image/png" } as File
    Object.defineProperty(input, "files", { value: createFileList([file]), configurable: true })
    fireEvent.change(input)

    expect(onFilesChange).toHaveBeenCalledWith([
      { name: "photo.png", path: "/mock/photo.png", type: "image", sizeBytes: 2048 },
    ])
  })

  it("非图片文件不进入附件回调", () => {
    const onFilesChange = vi.fn()
    const { container } = renderInput({ onFilesChange })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = { name: "report.pdf", size: 1024, type: "application/pdf" } as File
    Object.defineProperty(input, "files", { value: createFileList([file]), configurable: true })
    fireEvent.change(input)

    expect(onFilesChange).not.toHaveBeenCalled()
  })

  it("超过单张 6MB 上限的文件被拒绝", () => {
    const onFilesChange = vi.fn()
    const { container } = renderInput({ onFilesChange })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    const file = { name: "big.png", size: OPENCLAW_MAX_IMAGE_BYTES + 1, type: "image/png" } as File
    Object.defineProperty(input, "files", { value: createFileList([file]), configurable: true })
    fireEvent.change(input)

    expect(onFilesChange).not.toHaveBeenCalled()
  })

  it("粘贴图片直接进入附件回调，不改写输入文本", async () => {
    const onFilesChange = vi.fn()
    const onChange = vi.fn()
    const { container } = render(
      <OpenClawInput {...baseProps} onChange={onChange} files={[]} onFilesChange={onFilesChange} />,
    )

    const content = container.querySelector(".cm-content")
    expect(content).not.toBeNull()
    const file = { name: "shot.png", size: 4096, type: "image/png" } as File
    fireEvent.paste(content as HTMLElement, { clipboardData: createClipboardData([file]) })

    await waitFor(() => {
      expect(onFilesChange).toHaveBeenCalledWith([
        { name: "shot.png", path: "/mock/shot.png", type: "image", sizeBytes: 4096 },
      ])
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("粘贴非图片文件不接管粘贴动作", () => {
    const onFilesChange = vi.fn()
    const { container } = renderInput({ onFilesChange })

    const content = container.querySelector(".cm-content")
    const file = { name: "doc.pdf", size: 1024, type: "application/pdf" } as File
    fireEvent.paste(content as HTMLElement, { clipboardData: createClipboardData([file]) })

    expect(onFilesChange).not.toHaveBeenCalled()
  })

  it("仅附件（无文本）时发送按钮可用", () => {
    const onSend = vi.fn()
    const { getByRole } = render(
      <OpenClawInput
        {...baseProps}
        onSend={onSend}
        value=""
        files={[{ name: "a.png", path: "/mock/a.png", type: "image", sizeBytes: 1024 }]}
        onFilesChange={vi.fn()}
      />,
    )

    const sendButton = getByRole("button", { name: "Send" })
    expect(sendButton.hasAttribute("disabled")).toBe(false)
    fireEvent.click(sendButton)
    expect(onSend).toHaveBeenCalled()
  })
})
