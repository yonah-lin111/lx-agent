import type { TranslationDictionary } from "../en"
import { agent } from "./agent"
import { bottomBar } from "./bottomBar"
import { common } from "./common"
import { frontDesign } from "./frontDesign"
import { git } from "./git"
import { header } from "./header"
import { home } from "./home"
import { markdown } from "./markdown"
import { nav } from "./nav"
import { openclaw } from "./openclaw"
import { project } from "./project"
import { rightSidebar } from "./rightSidebar"
import { settings } from "./settings"
import { terminal } from "./terminal"
import { uiPreview } from "./uiPreview"
import { usage } from "./usage"

export const zh: TranslationDictionary = {
  common,
  nav,
  home,
  usage,
  header,
  bottomBar,
  rightSidebar,
  openclaw,
  settings,
  agent,
  markdown,
  terminal,
  git,
  project,
  uiPreview,
  frontDesign,
}
