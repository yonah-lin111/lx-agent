import type { TranscribeAudioInput, TranscribeAudioResult } from "@shared/settings"
import { getVoiceSettings } from "@/services/settingsService"

/**
 * 将音频 Buffer 提交到 Groq 平台进行语音转文字转录。
 */
export const transcribeAudioWithGroq = async (
  input: TranscribeAudioInput,
): Promise<TranscribeAudioResult> => {
  const voiceSettings = getVoiceSettings()
  const apiKey = voiceSettings.apiKey?.trim()
  if (!apiKey) {
    throw new Error("Groq API key is not configured. Please configure it in Voice Settings.")
  }

  const model = voiceSettings.model?.trim() || "whisper-large-v3-turbo"
  const rawBuffer = input.buffer instanceof Uint8Array ? input.buffer : new Uint8Array(input.buffer)

  if (rawBuffer.byteLength === 0) {
    throw new Error("Audio buffer is empty.")
  }

  const fileName = input.fileName || "audio.webm"
  const mimeType = input.mimeType || "audio/webm"

  // 构造标准 multipart/form-data 请求
  const formData = new FormData()
  const blob = new Blob([Buffer.from(rawBuffer)], { type: mimeType })
  formData.append("file", blob, fileName)
  formData.append("model", model)

  if (voiceSettings.language && voiceSettings.language !== "auto") {
    if (voiceSettings.language === "zh-TW" || voiceSettings.language === "zh-Hant") {
      formData.append("language", "zh")
      formData.append(
        "prompt",
        "以下是繁體中文語音轉錄內容，請保持繁體中文標點與詞彙，使用正體中文/繁體中文輸出。",
      )
    } else if (voiceSettings.language === "zh" || voiceSettings.language === "zh-CN") {
      formData.append("language", "zh")
      formData.append(
        "prompt",
        "以下是简体中文语音转录内容，请保持简体中文标点与词汇，使用简体中文输出。",
      )
    } else {
      formData.append("language", voiceSettings.language)
    }
  }

  formData.append("response_format", "verbose_json")

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "")
    let parsedMessage = errorBody
    try {
      const json = JSON.parse(errorBody) as { error?: { message?: string } }
      if (json.error?.message) {
        parsedMessage = json.error.message
      }
    } catch {
      // 保持原始 errorBody
    }
    throw new Error(`Groq Whisper transcription failed (${response.status}): ${parsedMessage}`)
  }

  const result = (await response.json()) as {
    text: string
    duration?: number
    language?: string
  }

  return {
    text: result.text ?? "",
    duration: result.duration,
    language: result.language,
  }
}
