import { migration as migration0001 } from "./0001_init"
import { migration as migration0002 } from "./0002_drop_project_item_sort_order"
import { migration as migration0003 } from "./0003_create_note_card"
import { migration as migration0006 } from "./0006_drop_note_card"
import { migration as migration0007 } from "./0007_add_project_folder_parent_folder_id"
import { migration as migration0008 } from "./0008_remove_agent_session_project_item_id"
import type { Migration } from "./types"

// 按版本升序排列的全部数据迁移。
export const migrations: Migration[] = [
  migration0001,
  migration0002,
  migration0003,
  migration0006,
  migration0007,
  migration0008,
]
