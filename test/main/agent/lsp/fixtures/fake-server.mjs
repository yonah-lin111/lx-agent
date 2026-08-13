// 测试用最小 LSP server（vscode-jsonrpc）：
// - 处理 initialize/initialized/shutdown/exit
// - textDocument/definition 回显收到的文本与位置（校验 0-based 透传与 URI）
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

connection.onRequest("initialize", () => ({ capabilities: {} }))
connection.onNotification("initialized", () => {})

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

connection.onRequest("shutdown", () => null)
connection.onNotification("exit", () => {
  connection.dispose()
  process.exit(0)
})
