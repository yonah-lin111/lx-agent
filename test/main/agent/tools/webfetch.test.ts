import { describe, expect, it, vi } from "vitest"
import { createWebFetchTool, type HostResolver } from "@/agent/tools/webfetch"

const toolText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.find((block) => block.type === "text")?.text ?? ""

// 模拟 Response（仅暴露 execute 用到的字段）。
const fakeResponse = (
  body: string,
  opts: {
    contentType?: string | null
    ok?: boolean
    status?: number
    location?: string | null
  } = {},
): Response => {
  const { contentType = "text/html", ok = true, status = 200, location = null } = opts
  return {
    ok,
    status,
    headers: {
      get: (name: string) => {
        const header = name.toLowerCase()
        if (header === "content-type") return contentType
        if (header === "location") return location
        return null
      },
    },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response
}

// 模拟 3xx 重定向响应。
const redirectResponse = (location: string, status = 302): Response =>
  fakeResponse("", { status, ok: false, location })

// 固定返回公网地址的 DNS 解析器（测试不依赖真实 DNS）。
const publicResolver: HostResolver = async () => [{ address: "93.184.216.34", family: 4 }]

// 按 host 返回 DNS 结果的解析器，未配置的 host 回退为公网地址。
const resolverWith = (
  hosts: Record<string, Array<{ address: string; family: number }>>,
): HostResolver => {
  return async (hostname) => hosts[hostname] ?? [{ address: "93.184.216.34", family: 4 }]
}

// 模拟可被 signal 中止的 fetch（abort 时抛 AbortError）。
const abortableFetch = (): typeof fetch =>
  (async (_input: string | URL | Request, init?: RequestInit) => {
    const signal = init?.signal
    const abortError = (): Error =>
      Object.assign(new Error("The operation was aborted."), { name: "AbortError" })
    if (signal?.aborted) throw abortError()
    return await new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(abortError()), { once: true })
    })
  }) as typeof fetch

const htmlBody = "<html><body><h1>Title</h1><p>Hello <b>world</b></p></body></html>"

describe("webfetch 工具", () => {
  it("参数校验：url 必填、format/timeout 枚举与范围", () => {
    const tool = createWebFetchTool(fetch)
    expect(tool.inputSchema.safeParse({}).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: "https://x.com", format: "xml" }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: "https://x.com", timeout: 0 }).success).toBe(false)
    expect(tool.inputSchema.safeParse({ url: "https://x.com", timeout: 121 }).success).toBe(false)
    expect(
      tool.inputSchema.safeParse({ url: "https://x.com", format: "markdown", timeout: 30 }).success,
    ).toBe(true)
  })

  it("executionMode 为 parallel（只读无副作用）", () => {
    expect(createWebFetchTool(fetch).executionMode).toBe("parallel")
  })

  it("阻断私网/内网地址（SSRF），不发起请求也不做 DNS 解析", async () => {
    const hosts = [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://100.64.0.1/",
      "http://localhost/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]
    let fetchCalls = 0
    let resolverCalls = 0
    const tool = createWebFetchTool(
      (async () => {
        fetchCalls += 1
        return fakeResponse("should not fetch")
      }) as typeof fetch,
      undefined,
      async () => {
        resolverCalls += 1
        return [{ address: "93.184.216.34", family: 4 }]
      },
    )
    for (const url of hosts) {
      await expect(tool.execute("t1", { url })).rejects.toThrow(
        /Private\/internal network addresses are not allowed|私网|内网/,
      )
    }
    expect(fetchCalls).toBe(0)
    expect(resolverCalls).toBe(0)
  })

  it("拒绝非 http/https scheme", async () => {
    const tool = createWebFetchTool(fetch, undefined, publicResolver)
    await expect(tool.execute("t1", { url: "ftp://example.com/x" })).rejects.toThrow(/http\/https/)
    await expect(tool.execute("t1", { url: "file:///etc/passwd" })).rejects.toThrow(/http\/https/)
  })

  it("HTML → markdown（turndown）", async () => {
    const tool = createWebFetchTool(
      (async () => fakeResponse(htmlBody)) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://example.com", format: "markdown" })
    expect(toolText(result)).toContain("# Title")
    expect(toolText(result)).toContain("Hello")
    expect(result.details).toMatchObject({ url: "https://example.com", provider: "webfetch" })
  })

  it("HTML → text（htmlparser2 提取文本）", async () => {
    const tool = createWebFetchTool(
      (async () => fakeResponse(htmlBody)) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://example.com", format: "text" })
    const text = toolText(result)
    expect(text).toContain("Title")
    expect(text).toContain("Hello world")
    expect(text).not.toContain("<h1>")
  })

  it("纯文本 content-type 原样返回（不转换）", async () => {
    const tool = createWebFetchTool(
      (async () =>
        fakeResponse("plain text\nline2", { contentType: "text/plain" })) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://example.com", format: "markdown" })
    expect(toolText(result)).toBe("plain text\nline2")
  })

  it("format=html 返回原始 HTML", async () => {
    const tool = createWebFetchTool(
      (async () => fakeResponse(htmlBody)) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://example.com", format: "html" })
    expect(toolText(result)).toContain("<h1>Title</h1>")
  })

  it("超 5MB 响应抛错", async () => {
    const big = "x".repeat(5 * 1024 * 1024 + 1)
    const tool = createWebFetchTool(
      (async () => fakeResponse(big)) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://example.com" })).rejects.toThrow(/5MB/)
  })

  it("流式响应超限时提前中断读取并取消 body（不整体缓冲）", async () => {
    let pulls = 0
    let cancelled = false
    const megabyte = new Uint8Array(1024 * 1024)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls > 20) {
          controller.close()
          return
        }
        controller.enqueue(megabyte)
      },
      cancel() {
        cancelled = true
      },
    })
    const response = {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name === "content-type" ? "text/plain" : null) },
      body: stream,
    } as unknown as Response

    const tool = createWebFetchTool(
      (async () => response) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://example.com" })).rejects.toThrow(/5MB/)

    expect(cancelled).toBe(true)
    // 5MB 上限附近即中断（含 stream 预取）：不得把 20MB 全拉完。
    expect(pulls).toBeLessThan(10)
  })

  it("非 2xx 状态抛错", async () => {
    const tool = createWebFetchTool(
      (async () => fakeResponse("not found", { status: 404, ok: false })) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://example.com" })).rejects.toThrow(/404/)
  })
})

describe("webfetch 重定向校验", () => {
  it("302 正常跟随到公网成功（转换与 details 不变）", async () => {
    const calls: string[] = []
    const tool = createWebFetchTool(
      (async (input: string | URL | Request) => {
        calls.push(String(input))
        return calls.length === 1
          ? redirectResponse("https://cdn.example.com/page")
          : fakeResponse(htmlBody)
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://public.example.com/" })
    expect(toolText(result)).toContain("# Title")
    expect(calls).toEqual(["https://public.example.com/", "https://cdn.example.com/page"])
    expect(result.details).toMatchObject({
      url: "https://public.example.com/",
      provider: "webfetch",
    })
  })

  it("相对 Location 按当前 URL 解析后跟随", async () => {
    const calls: string[] = []
    const tool = createWebFetchTool(
      (async (input: string | URL | Request) => {
        calls.push(String(input))
        return calls.length === 1 ? redirectResponse("/next/page", 301) : fakeResponse(htmlBody)
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://public.example.com/a" })
    expect(toolText(result)).toContain("# Title")
    expect(calls).toEqual(["https://public.example.com/a", "https://public.example.com/next/page"])
  })

  it("302 跳到私网/元数据地址被拦，不再发起后续请求", async () => {
    const calls: string[] = []
    const tool = createWebFetchTool(
      (async (input: string | URL | Request) => {
        calls.push(String(input))
        return redirectResponse("http://169.254.169.254/latest/meta-data/")
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://public.example.com/" })).rejects.toThrow(
      /Private\/internal network addresses are not allowed/,
    )
    expect(calls).toEqual(["https://public.example.com/"])
  })

  it("协议相对 Location 指向私网仍被拦", async () => {
    const calls: string[] = []
    const tool = createWebFetchTool(
      (async (input: string | URL | Request) => {
        calls.push(String(input))
        return redirectResponse("//169.254.169.254/x")
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://public.example.com/" })).rejects.toThrow(
      /Private\/internal network addresses are not allowed/,
    )
    expect(calls).toHaveLength(1)
  })

  it("Location 非 http/https 被拒绝", async () => {
    const tool = createWebFetchTool(
      (async () => redirectResponse("ftp://public.example.com/x")) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://public.example.com/" })).rejects.toThrow(
      /http\/https/,
    )
  })

  it("重定向超过 5 跳抛错（初始请求 + 5 跳后不再跟随）", async () => {
    let calls = 0
    const tool = createWebFetchTool(
      (async () => {
        calls += 1
        return redirectResponse(`/r${calls}`)
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    await expect(tool.execute("t1", { url: "https://public.example.com/" })).rejects.toThrow(
      /exceeded 5 redirects/,
    )
    expect(calls).toBe(6)
  })

  it("恰好 5 跳重定向可以成功", async () => {
    let calls = 0
    const tool = createWebFetchTool(
      (async () => {
        calls += 1
        return calls <= 5 ? redirectResponse(`/r${calls}`) : fakeResponse(htmlBody)
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    const result = await tool.execute("t1", { url: "https://public.example.com/" })
    expect(toolText(result)).toContain("# Title")
    expect(calls).toBe(6)
  })

  it("重定向链每一跳携带同一 abort signal", async () => {
    const signals: Array<AbortSignal | null | undefined> = []
    let calls = 0
    const tool = createWebFetchTool(
      (async (_input: string | URL | Request, init?: RequestInit) => {
        signals.push(init?.signal)
        calls += 1
        return calls === 1 ? redirectResponse("/step2") : fakeResponse(htmlBody)
      }) as typeof fetch,
      undefined,
      publicResolver,
    )
    await tool.execute("t1", { url: "https://public.example.com/start" })
    expect(signals).toHaveLength(2)
    expect(signals[0]).toBe(signals[1])
    expect(signals[0]?.aborted).toBe(false)
  })
})

describe("webfetch DNS 校验", () => {
  it("请求连接使用已校验 DNS 结果（pinned lookup），杜绝校验与连接之间的 rebinding", async () => {
    let pinned: { address: string; family: number } | null = null
    const capturingFetch = (async (
      _input: string | URL | Request,
      init?: RequestInit & {
        lookup?: (
          hostname: string,
          options: unknown,
          callback: (error: Error | null, address?: string, family?: number) => void,
        ) => void
      },
    ) => {
      const lookup = init?.lookup
      if (!lookup) throw new Error("missing pinned lookup")
      pinned = await new Promise((resolve, reject) => {
        lookup("example.com", {}, (error, address, family) => {
          if (error) reject(error)
          else resolve({ address: address ?? "", family: family ?? 0 })
        })
      })
      return fakeResponse("ok")
    }) as typeof fetch

    const tool = createWebFetchTool(capturingFetch, undefined, publicResolver)
    await tool.execute("t1", { url: "https://example.com/" })

    expect(pinned).toEqual({ address: "93.184.216.34", family: 4 })
  })

  it("初始 host DNS 解析到私网（rebinding）被拦，不发起请求", async () => {
    let fetchCalls = 0
    const tool = createWebFetchTool(
      (async () => {
        fetchCalls += 1
        return fakeResponse(htmlBody)
      }) as typeof fetch,
      undefined,
      resolverWith({ "rebind.example.com": [{ address: "127.0.0.1", family: 4 }] }),
    )
    await expect(tool.execute("t1", { url: "https://rebind.example.com/" })).rejects.toThrow(
      /Private\/internal network addresses are not allowed/,
    )
    expect(fetchCalls).toBe(0)
  })

  it("重定向目标 host DNS 解析到私网被拦", async () => {
    let calls = 0
    const tool = createWebFetchTool(
      (async () => {
        calls += 1
        return redirectResponse("https://internal.example.com/")
      }) as typeof fetch,
      undefined,
      resolverWith({ "internal.example.com": [{ address: "10.0.0.5", family: 4 }] }),
    )
    await expect(tool.execute("t1", { url: "https://public.example.com/" })).rejects.toThrow(
      /Private\/internal network addresses are not allowed/,
    )
    expect(calls).toBe(1)
  })

  it("解析结果含任一私网地址即拦截（含 IPv6 链路本地）", async () => {
    let fetchCalls = 0
    const tool = createWebFetchTool(
      (async () => {
        fetchCalls += 1
        return fakeResponse(htmlBody)
      }) as typeof fetch,
      undefined,
      resolverWith({
        "mixed.example.com": [
          { address: "93.184.216.34", family: 4 },
          { address: "fe80::1", family: 6 },
        ],
      }),
    )
    await expect(tool.execute("t1", { url: "https://mixed.example.com/" })).rejects.toThrow(
      /Private\/internal network addresses are not allowed/,
    )
    expect(fetchCalls).toBe(0)
  })

  it("DNS 解析失败不拦截，fetch 错误照常抛出", async () => {
    const tool = createWebFetchTool(
      (async () => {
        throw new Error("network down")
      }) as typeof fetch,
      undefined,
      async () => {
        throw new Error("ENOTFOUND")
      },
    )
    await expect(tool.execute("t1", { url: "https://missing.example.com/" })).rejects.toThrow(
      /network down/,
    )
  })
})

describe("webfetch abort/timeout", () => {
  it("run abort 生效并映射为超时错误", async () => {
    const tool = createWebFetchTool(abortableFetch(), undefined, publicResolver)
    const controller = new AbortController()
    const promise = tool.execute("t1", { url: "https://public.example.com/" }, controller.signal)
    const assertion = expect(promise).rejects.toThrow(/timed out/)
    controller.abort()
    await assertion
  })

  it("timeout 生效后中止请求", async () => {
    vi.useFakeTimers()
    try {
      const tool = createWebFetchTool(abortableFetch(), undefined, publicResolver)
      const promise = tool.execute("t1", { url: "https://public.example.com/", timeout: 1 })
      const assertion = expect(promise).rejects.toThrow(/timed out/)
      await vi.advanceTimersByTimeAsync(1000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
