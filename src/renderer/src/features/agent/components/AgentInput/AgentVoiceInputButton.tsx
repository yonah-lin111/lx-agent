import { Loader2, Mic, Square } from "lucide-react"
import type React from "react"
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useTranslation } from "@/i18n"

export interface AgentVoiceInputButtonRef {
  toggleRecording: () => void
  isRecording: boolean
}

export interface AgentVoiceInputButtonProps {
  onTranscribed: (text: string) => void
  onRecordingStateChange?: (state: "idle" | "recording" | "transcribing") => void
  disabled?: boolean
}

/**
 * 语音录入与转写按钮组件，支持录音控制、录音脉冲状态展示和 Groq Whisper 转录。
 */
export const AgentVoiceInputButton = forwardRef<
  AgentVoiceInputButtonRef,
  AgentVoiceInputButtonProps
>(({ onTranscribed, onRecordingStateChange, disabled = false }, ref): React.JSX.Element => {
  const { t } = useTranslation()
  const { error: errorToast, info: infoToast } = useLxAgentToast()

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (isTranscribing) {
      onRecordingStateChange?.("transcribing")
    } else if (isRecording) {
      onRecordingStateChange?.("recording")
    } else {
      onRecordingStateChange?.("idle")
    }
  }, [isRecording, isTranscribing, onRecordingStateChange])

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
      }
      stopTracks()
    }
  }, [stopTracks])

  const startRecording = async (): Promise<void> => {
    try {
      const voiceSettings = await settingsApi.getVoiceSettings()
      if (!voiceSettings.apiKey?.trim()) {
        errorToast(t("agent.voiceApiKeyMissing"))
        return
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        errorToast(t("agent.voiceDeviceUnsupported"))
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 寻找浏览器支持的音频录制格式
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : ""

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      audioChunksRef.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        stopTracks()
        const chunks = audioChunksRef.current
        if (chunks.length === 0) {
          setIsRecording(false)
          return
        }

        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" })
        if (audioBlob.size < 100) {
          setIsRecording(false)
          return
        }

        setIsTranscribing(true)
        try {
          const arrayBuffer = await audioBlob.arrayBuffer()
          const result = await settingsApi.transcribeAudio({
            buffer: arrayBuffer,
            mimeType: audioBlob.type,
            fileName: audioBlob.type.includes("mp4") ? "audio.mp4" : "audio.webm",
          })

          const text = result.text?.trim()
          if (text) {
            onTranscribed(text)
          } else {
            infoToast(t("agent.voiceNoSpeechDetected"))
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errorToast(`${t("agent.voiceTranscriptionFailed")}: ${message}`)
        } finally {
          setIsTranscribing(false)
          setIsRecording(false)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(250)
      setIsRecording(true)
    } catch (err) {
      stopTracks()
      setIsRecording(false)
      const message = err instanceof Error ? err.message : String(err)
      errorToast(`${t("agent.voiceRecordFailed")}: ${message}`)
    }
  }

  const stopRecording = (): void => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
  }

  const handleClick = useCallback((): void => {
    if (disabled || isTranscribing) return
    if (isRecording) {
      stopRecording()
    } else {
      void startRecording()
    }
  }, [disabled, isTranscribing, isRecording, stopRecording, startRecording])

  useImperativeHandle(
    ref,
    () => ({
      toggleRecording: handleClick,
      isRecording,
    }),
    [handleClick, isRecording],
  )

  const voiceTooltipContent = (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-white/90">
          {isRecording ? t("agent.voiceStopRecording") : t("agent.voiceInput")}
        </span>
      </div>
      <div className="border-t border-white/10 pt-1 text-[11px] text-white/45">
        {t("agent.voiceShortcutHint")}
      </div>
    </div>
  )

  if (isTranscribing) {
    return (
      <LxIconButton
        shape="circle"
        disabled
        aria-label={t("agent.voiceTranscribing")}
        title={{ content: t("agent.voiceTranscribing"), placement: "top" }}
        className="agent-input-voice-btn !text-white/40"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </LxIconButton>
    )
  }

  if (isRecording) {
    return (
      <LxIconButton
        shape="circle"
        aria-label={t("agent.voiceStopRecording")}
        title={{ content: voiceTooltipContent, placement: "top" }}
        className="agent-input-voice-btn relative !bg-rose-500/20 !text-rose-400 border border-rose-500/30 animate-pulse"
        onClick={handleClick}
      >
        <Square className="h-3 w-3 fill-current" />
      </LxIconButton>
    )
  }

  return (
    <LxIconButton
      shape="circle"
      aria-label={t("agent.voiceInput")}
      title={{ content: voiceTooltipContent, placement: "top" }}
      className="agent-input-voice-btn"
      disabled={disabled}
      onClick={handleClick}
    >
      <Mic className="h-3.5 w-3.5" />
    </LxIconButton>
  )
})
