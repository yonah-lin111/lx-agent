import { realpath } from "node:fs/promises"
import { resolve } from "node:path"

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

// 计算写队列 key：优先 realpath 规范化，路径不存在时回退为 resolve 结果。
const getMutationQueueKey = async (filePath: string): Promise<string> => {
  const resolvedPath = resolve(filePath)
  try {
    return await realpath(resolvedPath)
  } catch (error) {
    if (isMissingPathError(error)) {
      return resolvedPath
    }
    throw error
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
