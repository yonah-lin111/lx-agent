import { agentTools } from "./agentTools"
import { general } from "./general"
import { lsp } from "./lsp"
import { mcp } from "./mcp"
import { models } from "./models"
import { openclaw } from "./openclaw"
import { permissions } from "./permissions"

export const settings = {
  ...general,
  ...agentTools,
  ...lsp,
  ...mcp,
  ...models,
  ...permissions,
  ...openclaw,
}
