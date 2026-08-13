// 测试用最小 LSP server（vscode-jsonrpc）：
// - 处理 initialize/initialized/didOpen/shutdown/exit
// - textDocument/definition 回显收到的文本与位置（校验 0-based 透传与 URI）
// - textDocument/documentSymbol 仅对 didOpen 过的文档返回符号（校验 didOpen 发送）
// - FAKE_LSP_HANG=1 时 definition 挂起（触发客户端请求超时）
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node"

const connection = createMessageConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
)
connection.listen()

const openedUris = new Set()

connection.onRequest("initialize", () => ({ capabilities: {} }))
connection.onNotification("initialized", () => {})
connection.onNotification("textDocument/didOpen", (params) => {
  openedUris.add(params.textDocument.uri)
})

if (process.env.FAKE_LSP_HANG === "1") {
  connection.onRequest("textDocument/definition", () => new Promise(() => {}))
} else {
  connection.onRequest("textDocument/definition", (params) => ({
    uri: params.textDocument.uri,
    range: {
      start: params.position,
      end: { line: params.position.line, character: params.position.character + 1 },
    },
  }))
}

connection.onRequest("textDocument/documentSymbol", (params) => {
  if (!openedUris.has(params.textDocument.uri)) return []
  const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }
  return [{ name: "opened-symbol", kind: 5, range, selectionRange: range }]
})

connection.onRequest("shutdown", () => null)
connection.onNotification("exit", () => {
  connection.dispose()
  process.exit(0)
})
