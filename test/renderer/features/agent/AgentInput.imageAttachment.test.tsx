// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentInput } from "@/features/agent/components/AgentInput"
import type { AgentInputFile } from "@/features/agent/components/AgentInput/AgentInputFiles"

// 捕获 AgentMarkdownInput 的 onAddFiles（粘贴上传面板通道），供白名单用例直接驱动。
const host = vi.hoisted(() => ({
  onAddFiles: null as ((files: AgentInputFile[]) => void) | null,
}))

vi.mock("@/features/agent/components/AgentInput/AgentMarkdownInput", () => ({
  AgentMarkdownInput: (props: { onAddFiles?: (files: AgentInputFile[]) => void }) => {
    host.onAddFiles = props.onAddFiles ?? null
    return null
  },
}))

vi.mock("@/features/agent/api/promptHistoryApi", () => ({
  promptHistoryApi: { get: vi.fn().mockResolvedValue([]), add: vi.fn().mockResolvedValue([]) },
}))

// jsdom 未实现 ResizeObserver / requestAnimationFrame
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", ((cb: () => void) => {
  cb()
  return 0
}) as typeof requestAnimationFrame)

// 构造 handleFileSelect 需要的 FileList 形状（length + item）。
const fileListOf = (files: File[]): FileList =>
  ({
    length: files.length,
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList

const Harness = ({
  supportsImages,
  onFilesChange,
}: {
  supportsImages: boolean
  onFilesChange: (files: AgentInputFile[]) => void
}): React.JSX.Element => {
  const [files, setFiles] = useState<AgentInputFile[]>([])
  return (
    <AgentInput
      inputText=""
      isStreaming={false}
      isCompacting={false}
      queuedCount={0}
      queuedMessages={[]}
      onInputChange={vi.fn()}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onClear={vi.fn()}
      onUndo={vi.fn()}
      onCompact={vi.fn()}
      selectedModel="m"
      onModelChange={vi.fn()}
      modelOptions={[]}
      hasModelOptions={false}
      worktreeOptions={null}
      onWorktreeSelect={vi.fn()}
      selectedFiles={files}
      onFilesChange={(next) => {
        setFiles(next)
        onFilesChange(next)
      }}
      supportsImages={supportsImages}
    />
  )
}

describe("AgentInput 图片附件格式白名单（view_image 支持集 PNG/JPEG）", () => {
  afterEach(cleanup)

  beforeEach(() => {
    host.onAddFiles = null
    ;(window as unknown as { api: unknown }).api = {
      getPathForFile: vi.fn((file: File) => `/uploads/${file.name}`),
    }
  })

  const selectFiles = (files: File[]): void => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, "files", { value: fileListOf(files), configurable: true })
    fireEvent.change(input)
  }

  it("文件选择器：WebP 图片被拒绝，不进入附件列表", () => {
    const onFilesChange = vi.fn()
    render(<Harness supportsImages={true} onFilesChange={onFilesChange} />)

    selectFiles([new File(["x"], "shot.webp", { type: "image/webp" })])

    // handleFileSelect 末尾统一回写 nextFiles：被拒绝时回写空列表。
    expect(onFilesChange).toHaveBeenCalledWith([])
  })

  it("文件选择器：PNG 图片正常加入附件列表", () => {
    const onFilesChange = vi.fn()
    render(<Harness supportsImages={true} onFilesChange={onFilesChange} />)

    const png = new File(["x"], "shot.png", { type: "image/png" })
    selectFiles([png])

    expect(onFilesChange).toHaveBeenCalledTimes(1)
    expect(onFilesChange.mock.calls[0]![0]).toEqual([
      expect.objectContaining({
        name: "shot.png",
        path: "/uploads/shot.png",
        type: "image",
        extension: "PNG",
      }),
    ])
  })

  it("粘贴上传通道：GIF 被拒绝，PNG 正常加入（扩展名大小写不敏感）", () => {
    const onFilesChange = vi.fn()
    render(<Harness supportsImages={true} onFilesChange={onFilesChange} />)

    const gif: AgentInputFile = {
      id: "f-1",
      name: "anim.gif",
      path: "/uploads/anim.gif",
      type: "image",
      extension: "GIF",
    }
    act(() => host.onAddFiles?.([gif]))
    expect(onFilesChange).toHaveBeenCalledWith([])

    const png: AgentInputFile = {
      id: "f-2",
      name: "shot.png",
      path: "/uploads/shot.png",
      type: "image",
      extension: "PNG",
    }
    act(() => host.onAddFiles?.([png]))
    expect(onFilesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: "shot.png", type: "image" }),
    ])
  })

  it("模型不支持图片输入时，PNG 仍被拒绝", () => {
    const onFilesChange = vi.fn()
    render(<Harness supportsImages={false} onFilesChange={onFilesChange} />)

    selectFiles([new File(["x"], "shot.png", { type: "image/png" })])

    expect(onFilesChange).toHaveBeenCalledWith([])
  })
})
