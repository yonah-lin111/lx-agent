import { describe, expect, it } from "vitest"
import { HeadTailBuffer } from "@/agent/shell/headTailBuffer"

describe("HeadTailBuffer", () => {
  it("preserves full content when within budget", () => {
    const buffer = new HeadTailBuffer({ maxBytes: 100 })
    buffer.pushChunk("hello world")

    expect(buffer.totalBytes()).toBe(11)
    expect(buffer.retainedBytes()).toBe(11)
    expect(buffer.omittedBytes()).toBe(0)
    expect(buffer.toString()).toBe("hello world")
    expect(buffer.toStringWithOmissionMarker()).toBe("hello world")
  })

  it("symmetrically caps buffer and drops middle bytes", () => {
    // maxBytes = 10 -> headBudget = 5, tailBudget = 5
    const buffer = new HeadTailBuffer({ maxBytes: 10 })
    buffer.pushChunk("1234567890ABCDE") // 15 bytes

    // Head should be "12345" (5 bytes)
    // Tail should be newest 5 bytes: "ABCDE"
    // Omitted bytes: "67890" (5 bytes)
    expect(buffer.retainedBytes()).toBe(10)
    expect(buffer.omittedBytes()).toBe(5)
    expect(buffer.totalBytes()).toBe(15)
    expect(buffer.toString()).toBe("12345ABCDE")
    expect(buffer.toStringWithOmissionMarker()).toBe("12345\n... 5 bytes omitted ...\nABCDE")
  })

  it("handles incremental pushes correctly", () => {
    const buffer = new HeadTailBuffer({ maxBytes: 10 })
    buffer.pushChunk("123")
    buffer.pushChunk("45") // Head full now with "12345"
    buffer.pushChunk("67") // Tail has "67"
    buffer.pushChunk("890") // Tail has "67890"

    expect(buffer.omittedBytes()).toBe(0)
    expect(buffer.toString()).toBe("1234567890")

    buffer.pushChunk("XYZ") // 3 excess bytes
    expect(buffer.omittedBytes()).toBe(3)
    expect(buffer.toString()).toBe("1234590XYZ")
    expect(buffer.toStringWithOmissionMarker()).toBe("12345\n... 3 bytes omitted ...\n90XYZ")
  })

  it("merges another HeadTailBuffer via pushBuffer", () => {
    const buf1 = new HeadTailBuffer({ maxBytes: 10 })
    buf1.pushChunk("12345")

    const buf2 = new HeadTailBuffer({ maxBytes: 10 })
    buf2.pushChunk("ABCDE")

    buf1.pushBuffer(buf2)
    expect(bufferToString(buf1)).toBe("12345ABCDE")
  })

  it("supports Uint8Array and Buffer chunks", () => {
    const buffer = new HeadTailBuffer({ maxBytes: 20 })
    buffer.pushChunk(Buffer.from("buf-"))
    buffer.pushChunk(new Uint8Array([65, 66, 67])) // "ABC"

    expect(buffer.toString()).toBe("buf-ABC")
  })
})

function bufferToString(buf: HeadTailBuffer): string {
  return buf.toString()
}
