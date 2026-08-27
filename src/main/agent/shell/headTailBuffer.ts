/**
 * HeadTailBuffer
 *
 * A capped symmetric buffer that preserves a stable prefix ("head") and suffix ("tail"),
 * dropping the middle once it exceeds the configured maximum bytes.
 *
 * Follows the symmetrical 50/50 budget model from codex-rs/core/src/unified_exec/head_tail_buffer.rs.
 */

export const DEFAULT_UNIFIED_EXEC_OUTPUT_MAX_BYTES = 1024 * 1024 // 1 MiB

export interface HeadTailBufferOptions {
  maxBytes?: number
  headRatio?: number
}

export class HeadTailBuffer {
  private readonly maxBytes: number
  private readonly headBudget: number
  private readonly tailBudget: number

  private headChunks: Buffer[] = []
  private tailChunks: Buffer[] = []

  private _omittedBytes = 0

  constructor(options: HeadTailBufferOptions = {}) {
    this.maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_UNIFIED_EXEC_OUTPUT_MAX_BYTES)
    const ratio = Math.min(Math.max(options.headRatio ?? 0.5, 0), 1)
    this.headBudget = Math.floor(this.maxBytes * ratio)
    this.tailBudget = this.maxBytes - this.headBudget
  }

  /**
   * Total bytes currently retained by the buffer (head + tail).
   */
  public retainedBytes(): number {
    let sum = 0
    for (const c of this.headChunks) sum += c.length
    for (const c of this.tailChunks) sum += c.length
    return sum
  }

  /**
   * Total bytes dropped from the middle due to size cap.
   */
  public omittedBytes(): number {
    return this._omittedBytes
  }

  /**
   * Total bytes observed by the buffer, including omitted bytes.
   */
  public totalBytes(): number {
    return this.retainedBytes() + this._omittedBytes
  }

  /**
   * Append a chunk of bytes or string to the buffer.
   */
  public pushChunk(chunkInput: Buffer | Uint8Array | string): void {
    const chunk =
      typeof chunkInput === "string"
        ? Buffer.from(chunkInput, "utf-8")
        : Buffer.isBuffer(chunkInput)
          ? chunkInput
          : Buffer.from(chunkInput)

    if (chunk.length === 0) return

    const remainingForTail = this.fillHead(chunk)
    if (remainingForTail.length > 0) {
      this.pushTail(remainingForTail)
    }
  }

  private fillHead(chunk: Buffer): Buffer {
    let currentHeadLen = 0
    for (const c of this.headChunks) currentHeadLen += c.length
    const remainingHeadBudget = this.headBudget - currentHeadLen
    if (remainingHeadBudget <= 0) {
      return chunk
    }

    if (chunk.length <= remainingHeadBudget) {
      this.headChunks.push(chunk)
      return Buffer.alloc(0)
    }

    const headSlice = chunk.subarray(0, remainingHeadBudget)
    const tailSlice = chunk.subarray(remainingHeadBudget)
    this.headChunks.push(headSlice)
    return tailSlice
  }

  private pushTail(chunk: Buffer): void {
    let currentTailLen = 0
    for (const c of this.tailChunks) currentTailLen += c.length
    const remainingTailBudget = this.tailBudget - currentTailLen
    const excessTail = chunk.length - remainingTailBudget

    if (excessTail <= 0) {
      this.tailChunks.push(chunk)
      return
    }

    this._omittedBytes += excessTail

    // Discard old tail bytes from head of tailChunks
    let toDiscard = excessTail
    while (this.tailChunks.length > 0 && toDiscard > 0) {
      const first = this.tailChunks[0]
      if (first.length <= toDiscard) {
        toDiscard -= first.length
        this.tailChunks.shift()
      } else {
        this.tailChunks[0] = first.subarray(toDiscard)
        toDiscard = 0
      }
    }

    // If toDiscard is still > 0, incoming chunk itself has excess that must be skipped
    if (toDiscard > 0) {
      const toKeep = chunk.subarray(toDiscard)
      if (toKeep.length > 0) {
        this.tailChunks.push(toKeep)
      }
    } else {
      this.tailChunks.push(chunk)
    }
  }

  /**
   * Return retained output as single Buffer.
   */
  public toBytes(): Buffer {
    return Buffer.concat([...this.headChunks, ...this.tailChunks])
  }

  /**
   * Return string representation of retained buffer.
   */
  public toString(encoding: BufferEncoding = "utf-8"): string {
    return this.toBytes().toString(encoding)
  }

  /**
   * Return formatted omission marker.
   */
  public formatOmissionMarker(): string {
    return `\n... ${this._omittedBytes} bytes omitted ...\n`
  }

  /**
   * Return retained output with explicit omission marker between head and tail if bytes were omitted.
   */
  public toStringWithOmissionMarker(encoding: BufferEncoding = "utf-8"): string {
    if (this._omittedBytes === 0) {
      return this.toString(encoding)
    }

    const headBuf = Buffer.concat(this.headChunks)
    const tailBuf = Buffer.concat(this.tailChunks)
    return `${headBuf.toString(encoding)}${this.formatOmissionMarker()}${tailBuf.toString(encoding)}`
  }

  /**
   * Append a later buffer with same or compatible budget.
   */
  public pushBuffer(other: HeadTailBuffer): void {
    if (other.retainedBytes() === 0 && other.omittedBytes() === 0) return

    this._omittedBytes += other.omittedBytes()

    for (const chunk of other.headChunks) {
      this.pushChunk(chunk)
    }
    for (const chunk of other.tailChunks) {
      this.pushChunk(chunk)
    }
  }

  /**
   * Clear buffer contents.
   */
  public clear(): void {
    this.headChunks = []
    this.tailChunks = []
    this._omittedBytes = 0
  }
}
