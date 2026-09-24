export const general = {
  title: "设置",
  general: "通用设置",
  models: "模型配置",
  providers: "模型 Provider",
  voice: "语音设置",
  permissions: "权限",
  collaboration: "协作模式",
  generalDesc: "配置界面语言和通用偏好设置",
  generalDoc: `### 通用偏好设置

配置界面的基本运行偏好与系统维护策略。

#### 💡 核心配置项
- **界面语言 (Language)**：切换软件界面的多语言本地化显示（支持简体中文与英文）。
- **截图缓存清理 (Screenshot Cleanup)**：定期自动清理保存超过 14 天的剪贴板截图缓存文件，释放磁盘存储空间。`,
  modelsDesc: "选择各类任务默认使用的模型",
  modelsDoc: `### 默认任务模型配置

为不同场景的任务指定默认调用的模型与 Provider。

#### 💡 任务类型说明
- **默认对话模型**：主对话面板与 Agent 交互时默认使用的基础大语言模型。
- **标题总结模型**：用于在新会话首轮交互后自动生成简短对话标题的模型。
- **推荐问题模型**：在 Agent 回复完毕后生成推荐追问或后续探索问题的模型。
- **上下文压缩模型**：当会话长度超出窗口限制时，负责提炼历史上下文并压缩记忆的模型。`,
  providersDesc: "配置与管理模型 Provider 及模型参数",
  providersDoc: `### 模型 Provider 配置与管理

统一管理接入的各个大语言模型服务商（Provider）及其 API 鉴权和模型参数。

#### 💡 核心功能
- **标准与兼容协议**：支持 OpenAI Compatible、OpenAI、Anthropic、Google 等主流接口协议。
- **模型自动获取**：填入 Base URL 与 API Key 后，可一键自动拉取服务商支持的全部模型列表。
- **自定义模型**：支持手动新增、编辑或删除特定模型 ID 与显示名称。`,
  voiceDesc: "配置 Groq 平台语音转文字（STT）模型与 API 参数",
  voiceDoc: `### 语音输入与转文字设置

基于 Groq 平台的超高速 Whisper 模型进行语音转文字识别。

#### 💡 核心配置项
- **Groq API Key**：在 Groq 控制台获取的 API 密钥，用于音频接口鉴权。
- **语音模型**：推荐使用 \`whisper-large-v3-turbo\`，兼具高精度与极致转换速度。
- **识别语言**：默认自动检测，也可指定中文、英文等以提升识别准度与速度。`,
  voiceApiKey: "Groq API Key",
  voiceApiKeyDesc: "用于访问 Groq Whisper 语音转文字接口的凭证密钥",
  voiceModel: "语音识别模型",
  voiceModelDesc: "选择用于语音转写的 Whisper 模型版本",
  voiceLanguage: "音频语言",
  voiceLanguageDesc: "语音说话的主要语言，选择自动检测或固定语言以优化识别准确率",
  permissionsDesc: "配置 Agent 工具执行权限与确认模式",
  collaborationDesc: "配置新会话默认协作模式与各模式能力权限",
  completionNotify: "完成通知",
  completionNotifyDesc: "任务完成时发送系统通知；仅在应用窗口未聚焦时提醒",
  agentNotifyLabel: "Agent 任务完成时提醒我",
  openclawNotifyLabel: "OpenClaw 员工任务完成时提醒我",
  updateTitle: "版本与更新",
  updateDesc: "从 GitHub Releases 检查已发布的最新版本",
  updateCurrentVersion: "当前版本 {{version}}",
  updateCheck: "检查更新",
  updateChecking: "检查中...",
  updateLatest: "已是最新版本",
  updateAvailable: "发现新版本 {{version}}",
  updateDownload: "前往下载",
  updateFailed: "检查失败，请稍后重试",
}
