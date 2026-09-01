import type { CliId } from "@shared/settings"
import { Terminal } from "lucide-react"
import type React from "react"

export interface CliIconProps {
  id: CliId | "lx" | "agent" | string
  className?: string
}

/**
 * 统一渲染 AI CLI / Agent 厂商品牌 Logo。
 */
export const CliIcon = ({ id, className = "h-3.5 w-3.5 flex-none" }: CliIconProps): React.JSX.Element => {
  const normalized = id.toLowerCase().trim()

  switch (normalized) {
    case "claude":
    case "claudecode":
    case "cc":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`text-[#D97757] ${className}`}
          aria-hidden="true"
        >
          <path d="M12 2a1.5 1.5 0 0 1 1.5 1.5v4.38l3.1-3.1a1.5 1.5 0 1 1 2.12 2.12l-3.1 3.1h4.38a1.5 1.5 0 1 1 0 3h-4.38l3.1 3.1a1.5 1.5 0 1 1-2.12 2.12l-3.1-3.1V19.5a1.5 1.5 0 1 1-3 0v-4.38l-3.1 3.1a1.5 1.5 0 1 1-2.12-2.12l3.1-3.1H4.5a1.5 1.5 0 1 1 0-3h4.38l-3.1-3.1a1.5 1.5 0 1 1 2.12-2.12l3.1 3.1V3.5A1.5 1.5 0 0 1 12 2z" />
        </svg>
      )

    case "codex":
    case "openai":
    case "cx":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          fillRule="evenodd"
          className={`text-[#10A37F] ${className}`}
          aria-hidden="true"
        >
          <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
        </svg>
      )

    case "gemini":
    case "gm":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`text-[#4285F4] ${className}`}
          aria-hidden="true"
        >
          <path d="M12 2C12 7.523 7.523 12 2 12C7.523 12 12 16.477 12 22C12 16.477 16.477 12 22 12C16.477 12 12 7.523 12 2Z" />
        </svg>
      )

    case "opencode":
    case "oc":
      return (
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`text-white/90 ${className}`}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M13 14H3V2H13V14ZM10.5 4.4H5.5V11.6H10.5V4.4Z"
          />
        </svg>
      )

    case "agy":
    case "antigravity":
    case "ag":
      return (
        <svg
          viewBox="0 0 112 112"
          fill="currentColor"
          className={`text-[#3186FF] ${className}`}
          aria-hidden="true"
        >
          <path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z" />
        </svg>
      )

    case "grok":
    case "gk":
      return (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`text-white ${className}`}
          aria-hidden="true"
        >
          <path d="M2.5 3h4.6l5.2 7.3L17.5 3h4l-7.2 10.1L22 21h-4.6l-5.7-8.1L6 21H2l7.7-10.8L2.5 3z" />
        </svg>
      )

    case "lx":
    case "agent":
      return (

        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M4 4H8V16H13V20H4V4Z" fill="#38BDF8" />
          <path
            d="M13.5 8.5L16.5 13L13.5 17.5H16.5L18.5 14.5L20.5 17.5H23.5L20 12.5L23 8.5H20L18.5 10.8L17 8.5H13.5Z"
            fill="#F472B6"
          />
        </svg>
      )

    default:
      return <Terminal className={className} aria-hidden="true" />
  }
}
