import { realpath } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"

// 按文件分桶的写操作串行队列：同 key 的写操作链式排队，不同文件仍并行。
const fileMutationQueues = new Map<string, Promise<void>>()
let registrationQueue = Promise.resolve()

const isMissingPathError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  )
}

// 计算写队列 key：优先 realpath 规范化，路径不存在时沿祖先向上找到最近的真实目录再拼回尾部。
// 若仅对不存在路径回退 resolve，软链目录（如 /tmp → /private/tmp）下的新文件会与真实路径
// 得到不同 key，导致同一文件的并发写不被串行化。
const getMutationQueueKey = async (filePath: string): Promise<string> => {
  let current = resolve(filePath)
  const missingTail: string[] = []
  while (true) {
    try {
      const real = await realpath(current)
      return missingTail.length > 0 ? resolve(real, ...missingTail.reverse()) : real
    } catch (error) {
      if (!isMissingPathError(error)) throw error
      const parent = dirname(current)
      if (parent === current) return resolve(filePath)
      missingTail.push(basename(current))
      current = parent
    }
  }
}

// 串行化针对同一文件的写操作；不同文件的操作仍并行执行。
export const withFileMutationQueue = async <T>(
  filePath: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const registration = registrationQueue.then(async () => {
    const key = await getMutationQueueKey(filePath)
    const currentQueue = fileMutationQueues.get(key) ?? Promise.resolve()

    let releaseNext!: () => void
    const nextQueue = new Promise<void>((resolveQueue) => {
      releaseNext = resolveQueue
    })
    const chainedQueue = currentQueue.then(() => nextQueue)
    fileMutationQueues.set(key, chainedQueue)

    return { key, currentQueue, chainedQueue, releaseNext }
  })
  registrationQueue = registration.then(
    () => undefined,
    () => undefined,
  )

  const { key, currentQueue, chainedQueue, releaseNext } = await registration
  await currentQueue
  try {
    return await fn()
  } finally {
    releaseNext()
    if (fileMutationQueues.get(key) === chainedQueue) {
      fileMutationQueues.delete(key)
    }
  }
}
