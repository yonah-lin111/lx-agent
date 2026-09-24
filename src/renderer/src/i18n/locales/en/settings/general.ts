export const general = {
  title: "Settings",
  general: "General",
  models: "Models",
  providers: "Model Providers",
  voice: "Voice Input",
  permissions: "Permissions",
  collaboration: "Agent Mode",
  generalDesc: "Configure interface language and general application preferences",
  generalDoc: `### General Preferences

Configure application runtime preferences and system maintenance policies.

#### 💡 Core Options
- **Interface Language**: Switch the application display language (supports English and Simplified Chinese).
- **Screenshot Cache Cleanup**: Automatically clean up clipboard screenshot cache files older than 14 days to free disk space.`,
  modelsDesc: "Select default models for various tasks",
  modelsDoc: `### Default Model Configuration

Specify default models and providers for different workflow tasks.

#### 💡 Task Types
- **Default Chat Model**: The primary LLM used in the chat panel and agent interactions.
- **Title Summary Model**: Generates a concise title after the first turn of a conversation.
- **Suggested Questions Model**: Recommends follow-up inquiries or exploration topics after agent responses.
- **Context Compaction Model**: Summarizes conversation history when token limits are reached.`,
  providersDesc: "Configure and manage model providers and parameters",
  providersDoc: `### Model Provider Management

Centrally manage LLM provider endpoints, authentication credentials, and model configurations.

#### 💡 Key Features
- **Standard & Compatible Protocols**: Supports OpenAI Compatible, OpenAI, Anthropic, Google, and more.
- **Auto Model Discovery**: Automatically fetch available models by providing Base URL and API Key.
- **Custom Models**: Manually add, edit, or delete specific model identifiers and display labels.`,
  voiceDesc: "Configure Groq platform speech-to-text (STT) models and API settings",
  voiceDoc: `### Voice Input & Transcription Settings

Ultra-fast speech-to-text transcription powered by Whisper on Groq.

#### 💡 Core Options
- **Groq API Key**: API key obtained from Groq Console for authentication.
- **Speech Model**: Recommend \`whisper-large-v3-turbo\` for optimal balance of high accuracy and lightning speed.
- **Audio Language**: Auto-detect by default, or explicitly specify for faster and more accurate recognition.`,
  voiceApiKey: "Groq API Key",
  voiceApiKeyDesc: "Credential key for accessing Groq Whisper transcription API",
  voiceModel: "Transcription Model",
  voiceModelDesc: "Whisper model version used for speech recognition",
  voiceLanguage: "Audio Language",
  voiceLanguageDesc: "Primary language spoken in audio; select Auto or a specific language",
  permissionsDesc: "Configure agent tool execution permissions and confirmation modes",
  collaborationDesc:
    "Configure the default agent mode for new sessions and per-mode capability permissions",
  completionNotify: "Completion Notifications",
  completionNotifyDesc:
    "Send a system notification when a task completes; alerts only appear while the app window is unfocused",
  agentNotifyLabel: "Notify me when the Agent completes a task",
  openclawNotifyLabel: "Notify me when an OpenClaw employee completes a task",
  updateTitle: "Version & Updates",
  updateDesc: "Check the latest release published on GitHub Releases",
  updateCurrentVersion: "Current version {{version}}",
  updateCheck: "Check for updates",
  updateChecking: "Checking...",
  updateLatest: "You are on the latest version",
  updateAvailable: "New version {{version}} is available",
  updateDownload: "Download",
  updateFailed: "Check failed, please try again later",
}
