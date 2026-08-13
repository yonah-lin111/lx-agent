import { migration as migration0001 } from "./0001_init"
import { migration as migration0002 } from "./0002_drop_project_item_sort_order"
import type { Migration } from "./types"

// 按版本升序排列的全部数据迁移。
export const migrations: Migration[] = [migration0001, migration0002]
