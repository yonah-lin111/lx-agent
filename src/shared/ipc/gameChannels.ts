// 游戏领域 IPC channel 常量。
export const GAME_CHANNELS = {
  list: "game:list",
  importFromDialog: "game:importFromDialog",
  rename: "game:rename",
  remove: "game:remove",
  markPlayed: "game:markPlayed",
  writeSave: "game:writeSave",
  getRuntimeConfig: "game:getRuntimeConfig",
} as const
