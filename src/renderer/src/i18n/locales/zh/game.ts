export const game = {
  title: "游戏",
  subtitle: "导入本地 GBA ROM，模拟器离线运行，存档保存在本机应用数据目录。",
  import: "导入 GBA 游戏",
  importing: "导入中…",
  loading: "加载游戏列表…",
  builtin: {
    sectionTitle: "内置游戏",
    tag: "内置",
    best: "最高分",
    pause: "暂停",
    resume: "继续",
    restart: "重新开始",
    paused: "已暂停",
    result: {
      title: "本局结束",
      newBest: "新纪录！",
      best: "最高分",
      playAgain: "再来一局",
      pickAnother: "换个游戏",
    },
    games: {
      tetris: {
        name: "俄罗斯方块",
        description: "堆叠下落的方块、消行，在加速中活得更久。",
        controls: "← → 移动 · ↑ / X 旋转 · ↓ 软降 · 空格硬降",
        info: `### 俄罗斯方块

用下落的方块填满整行来消行，每消除 10 行重力加速一档。

- **← / →** 移动，**↓** 软降
- **↑** 或 **X** 旋转（带简化踢墙）
- **空格** 硬降，瞬间落地并可获得额外分数
- 幽灵投影提示方块最终落点

**计分：** 一次消 1/2/3/4 行得 40/100/300/1200 × 等级；软降每格 1 分、硬降每格 2 分。新方块无法生成时本局结束。`,
      },
      dodge: {
        name: "星尘闪避",
        description: "在 60 秒弹幕风暴中生存，顺手捡走星光。",
        controls: "WASD / 方向键移动 · 空格冲刺",
        info: `### 星尘闪避

带着 3 点生命在弹幕里撑过 **60 秒**。

- **WASD / 方向键**移动
- **空格**冲刺（约 0.2 秒，冷却约 1 秒）
- 被击中扣 1 点生命，随后短暂无敌
- 星光每隔几秒刷新，超时会消失

**计分：** 每生存 1 秒 10 分 + 每颗星光 25 分。`,
      },
      cake: {
        name: "叠蛋糕",
        description: "一层层叠高蛋糕，错位部分被切掉，别让蛋糕落空。",
        controls: "点击 / 空格落下 · 完美对齐可保持宽度",
        info: `### 叠蛋糕

蛋糕层在塔顶左右摆动，按 **点击 / 空格** 让它落下。

- 与下层错位的部分会被**切掉**，塔身随之变窄
- 偏差在 4px 内视为完美对齐：宽度不变并得 2 分
- 完全落空（重叠为 0）本局结束
- 层数越高，摆动越快

**计分：** 每层 1 分，完美落层 2 分。`,
      },
    },
  },
  imported: {
    sectionTitle: "导入游戏",
    tag: "导入",
    empty: "还没有导入的游戏",
    emptyHint:
      "点击「导入游戏」选择 .gba 文件，单个文件不超过 64MB；重复导入同一游戏不会新建卡片。",
  },
  importResult: {
    imported: "已导入 {{count}} 个游戏",
    duplicated: "「{{title}}」已存在，未重复导入",
    invalid: "「{{file}}」导入失败：{{reason}}",
  },
  invalidReason: {
    unsupportedExtension: "仅支持 .gba 文件",
    tooLarge: "文件超过 64MB",
    unreadable: "文件无法读取",
  },
  card: {
    more: "更多操作",
    rename: "重命名",
    remove: "删除",
    neverPlayed: "尚未游玩",
    lastPlayed: "最近游玩 {{time}}",
  },
  rename: {
    title: "重命名游戏",
    placeholder: "输入卡片标题",
    confirm: "保存",
    cancel: "取消",
  },
  remove: {
    title: "删除游戏",
    description: "将删除「{{title}}」及其存档，此操作不可撤销。",
    success: "已删除「{{title}}」",
  },
  stage: {
    loading: "模拟器加载中…",
    error: "模拟器加载失败",
    retry: "重试",
    back: "返回游戏列表",
    exitHint: "ESC 退出",
    speed: "倍速 ×{{ratio}}",
  },
  error: {
    listFailed: "读取游戏列表失败",
    importFailed: "导入失败",
    renameFailed: "重命名失败",
    removeFailed: "删除失败",
    saveFailed: "存档写入失败",
  },
}
