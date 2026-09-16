# `Token Saver（RTK 工具输出压缩 + Caveman/Ponytail 风格提示词）` 测试用例

**前置说明：**

- 环境/配置：在 `.worktrees/token-saver` 下执行 `pnpm dev` 启动应用（predev 会自动重编 electron 原生模块）；配置节点为 `~/.lx/config.json` 的 `tokenSaver`（`rtkEnabled` / `cavemanEnabled` / `cavemanLevel` / `ponytailEnabled` / `ponytailLevel`）；RTK/Caveman/Ponytail 全部为进程内实现，无外部依赖、无需安装。
- 生效时机：设置页保存后**下一轮模型请求**生效（main 每请求读取配置），无需重启、无需新建会话；仅对 `chat` / `subagent` 请求生效，标题、建议问题、上下文压缩摘要不生效；只作用于出站请求副本，会话历史与界面始终保留原始内容。
- 观察位置：设置页左侧栏 `Token Saver` 分区与底部保存栏；会话内工具结果块（应保持完整原始输出）；用量统计的输入 token；模型回复风格；终端 `[TokenSaver]` 警告（仅异常兜底时出现）。

```text
# 准备一个大输出仓库场景（在任意 git 仓库执行，供组 3 / 组 4 使用）：
#   确保最近有多次提交，且存在大 diff / 大 log
#   git log -p -5   → 输出通常数千行，可稳定触发压缩
#
# 配置节点示例（~/.lx/config.json）：
#   "tokenSaver": {
#     "rtkEnabled": true,
#     "cavemanEnabled": false,
#     "cavemanLevel": "full",
#     "ponytailEnabled": false,
#     "ponytailLevel": "full"
#   }
```

---

## 组 1：`设置页默认值与卡片信息`

- **提示词**：打开 `设置 → Token Saver`
- **验证步骤**：确认左侧栏存在 `Token Saver` tab（中文界面为 `Token 节省`）→ 观察三张卡片（RTK / Caveman / Ponytail）的初始勾选状态与说明 → 悬浮卡片右侧 Github 图标与说明行 `(i)` 按钮。

- **期望**：RTK 勾选开启，Caveman / Ponytail 关闭；每张卡片显示标题、一行说明与官网入口 Tooltip，点击 Github 图标打开对应仓库（rtk-ai/rtk、JuliusBrussee/caveman、DietrichGebert/ponytail）；说明行 `(i)` 弹出文档，包含压缩范围与 12 个过滤器名；无安装按钮、无控制台报错。

## 组 2：`Caveman 档位选择与语言过滤`

- **提示词**：勾选 Caveman → 依次切换档位 `Lite / Full / Ultra`
- **验证步骤**：观察档位选择器与说明文案排版 → 切到 `设置 → 通用 → 语言` 为 `中文`，回到 Token Saver 观察档位列表 → 选 `文 Full` 后保存，再把语言切回 `English`，重开 Token Saver。

- **期望**：档位选择器独占一行，说明文案**另起一行完整显示、不截断**（如 `Drop articles, fragments OK`、`Ladder enforced: stdlib/native first`），切换档位说明即时更新；中文界面出现 6 个档位（含 `文 Lite / 文 Full / 文 Ultra`），英文界面只显示 3 个英文档位；英文界面下已保存的 `wenyan` 档显示为 `Ultra`，再次保存后落盘为 `ultra`。

## 组 3：`RTK 压缩生效（省 token）`

- **提示词**：`执行 git log -p -5 并把完整输出贴出来`
- **验证步骤**：确保 RTK 开启并已保存 → 发送提示词 → 展开该次工具结果块查看展示内容 → 对照用量统计中该轮请求的输入 token → 关闭 RTK（保存）后发送同一提示词，再次对比输入 token。

  ```text
  git log -p -5
  ```

- **期望**：RTK 开启时模型仍能准确总结提交内容（收到的是压缩后的 diff/log），但会话内工具结果块展示的是**完整原始输出**（未被改写）；同一命令关闭 RTK 后输入 token 明显更大（大输出场景通常减少 60% 以上）；终端无 `[TokenSaver]` 报错。

## 组 4：`错误结果与短输出不压缩`

- **提示词**：`执行 git log --no-such-option，原样告诉我报错内容`
- **验证步骤**：RTK 开启状态下发送 → 观察工具结果与模型引用内容 → 再执行一次输出小于 500 字符的命令（如 `git status` 干净仓库）。

- **期望**：工具报错输出完整透传（错误 trace 不被折叠/截断），模型能逐行引用报错；短输出原样进入上下文（低于压缩阈值不处理）；两种情况均无异常。

## 组 5：`Caveman 输出风格压缩`

- **提示词**：先开启 Caveman（档位 `Ultra`）并保存，再发送 `解释一下 HTTP 缓存协商机制，并给一段可运行的 curl 示例`
- **验证步骤**：观察该轮模型回复的篇幅与语气 → 检查代码块与命令是否原样 → 观察会话标题（自动生成）与建议问题按钮文案 → 关闭 Caveman 后发送同题对比。

- **期望**：回复明显简短、电报体（去掉寒暄与铺垫），但技术信息完整；代码块、命令、文件路径、错误字符串原样保留；会话标题与建议问题保持常规表述、无风格漂移；关闭后下一轮恢复常规语气（无需重启）。

## 组 6：`Ponytail 代码倾向`

- **提示词**：先开启 Ponytail（档位 `Full`）并保存，再发送 `写一个对数组去重并保持原顺序的函数`
- **验证步骤**：观察模型给出的实现与说明篇幅 → 检查是否引入多余抽象/新依赖 → 关闭 Ponytail 后同题对比。

- **期望**：优先使用语言标准库或一行实现（如 `[...new Set(arr)]`），不新建文件、不引入新依赖、不提供未要求的接口/工厂/配置；说明控制在短句内；输入校验/错误处理等必要环节不被省略；关闭后下一轮恢复。

## 组 7：`保存、重置与未保存拦截`

- **提示词**：在 Token Saver 页面依次执行：改开关 → 不保存切 tab → 保存 → 再改后重置
- **验证步骤**：打开任意开关（如 Ponytail）观察底部保存栏 → 直接点击左侧栏其他设置 tab → 弹窗中点"取消"→ 回到页面点击保存 → 再次修改档位后点击重置 → 打开 `~/.lx/config.json` 核对。

- **期望**：有未保存修改时底部保存栏出现；带脏数据切 tab 弹"未保存更改"确认框，取消后停留在原页面且草稿仍在；保存后写入 `tokenSaver` 节点（其他节点与未知字段保留）；重置恢复上次保存值，保存栏随之消失。

## 组 8：`非 chat 请求不受影响`

- **提示词**：Caveman `Ultra` 开启状态下，新建会话发送任意一句闲聊（触发标题与建议问题生成），然后执行 `/compact`
- **验证步骤**：观察会话标题、建议问题、压缩摘要块的文案风格 → 观察上下文容量状态栏正常回落。

- **期望**：标题、建议问题、压缩摘要均使用常规表达（无 caveman 风格、无电报体）；`/compact` 结果正常、摘要可读；主对话回复仍为 caveman 风格（确认按 purpose 精确门控）。

## 组 9：`配置容错与非法值回退`

- **提示词**：退出应用，手动改写 `~/.lx/config.json` 后重启进入设置页
- **验证步骤**：改写配置 → 重启 → 打开 `设置 → Token Saver` 观察回显 → 任意改动后保存 → 再次查看配置文件。

  ```json
  "tokenSaver": {
    "rtkEnabled": "yes",
    "cavemanEnabled": true,
    "cavemanLevel": "bogus",
    "ponytailEnabled": false,
    "ponytailLevel": "bogus"
  }
  ```

- **期望**：应用正常启动不崩溃；非法字段回退默认（`rtkEnabled=true`、`cavemanLevel=full`、`ponytailLevel=full`，合法字段 `cavemanEnabled=true` 保留）；设置页回显与默认值一致；保存后写回合法值；`tokenSaver` 节点整个缺失时同样返回全默认。

## 组 10：`执行流程底部 Token Saver 标注（含落库恢复）`

- **提示词**：RTK 与 Caveman（Ultra）开启状态下发送 `执行 git log -p -5 并总结改动`
- **验证步骤**：打开该轮的执行流程（AgentExecutionFlowList）→ 观察被压缩的工具步骤底栏（如 `bash` 的 git log 调用）→ 再观察最终回复步骤底栏 → 悬停两处标注查看明细 → 完全退出应用后重开，恢复该会话并再次观察同一轮。

- **期望**：被压缩的**工具步骤**底栏显示 `RTK −86k` 这类标注（Tooltip：`RTK: git-log — saved 86,412 chars`），归因到该次工具调用；**回复步骤**底栏显示请求级汇总（`RTK −总计 · Caveman ultra · Ponytail full`）；同一请求不会在同一卡片的工具级与请求级之间重复展示 RTK 数值；RTK 未命中（短输出/RTK 关闭）或仅非 chat 请求（标题、建议问题、compact）时不显示标注；**重启应用恢复会话后标注仍在**（随 assistant 消息 entry payload 落库，工具步骤按 toolCallId 归因取首次命中）。

---

## 附：`限制与自动化覆盖`

- 压缩只作用于出站请求副本：会话历史、界面展示、会话导出始终是原始输出；工具错误结果一律跳过；单条输出小于 500 字符或压缩后无收益时不处理。
- 执行流程底部标注只在请求实际生效时出现（RTK 至少命中一次过滤器；Caveman/Ponytail 提示词实际注入），随 assistant 消息 entry 落库，恢复会话后照常显示。
- 未实现 9router 的 Headroom（外部 Python 服务）与 Pxpipe（外部二进制）；官网链接仅作参考，不参与运行。
- 输入 token 的节省幅度取决于输出形态（git diff/grep/ls/tree/构建日志收益最高）；Caveman/Ponytail 为提示词级引导，效果受模型影响。
- 自动化回归命令（对应过滤、注入、标注、设置与契约的 163 个用例）：

  ```bash
  pnpm test -- test/main/agent/tokenSaver test/main/agent/aiSdkStreamFn.test.ts test/main/services/settingsService.tokenSaver.test.ts test/renderer/features/agent/executionFlow.test.ts test/renderer/features/agent/AgentExecutionFlowItem.tokenSaver.test.tsx test/renderer/features/settings test/preload/tokenSaverSettingsApi.test.ts
  ```
