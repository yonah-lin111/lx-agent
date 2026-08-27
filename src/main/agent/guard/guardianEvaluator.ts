/**
 * Guardian Risk Evaluator
 *
 * Implements the 4-dimensional security risk taxonomy from Codex Guardian Policy:
 * 1. Data Exfiltration
 * 2. Credential Probing
 * 3. Persistent Security Weakening
 * 4. Destructive Actions
 */

export type GuardianRiskLevel = "low" | "medium" | "high" | "critical"
export type GuardianUserAuthorization = "unknown" | "low" | "medium" | "high"
export type GuardianCategory =
  | "data_exfiltration"
  | "credential_probing"
  | "security_weakening"
  | "destructive_action"
  | "safe"

export interface GuardianAction {
  toolName: string
  args: Record<string, unknown>
  cwd?: string
}

export interface GuardianAssessment {
  riskLevel: GuardianRiskLevel
  userAuthorization: GuardianUserAuthorization
  outcome: "allow" | "deny"
  category: GuardianCategory
  rationale: string
  requiresApproval: boolean
}

// 1. Data Exfiltration patterns
const EXFILTRATION_PATTERNS = [
  // Egress commands targeting suspicious or external endpoints with payloads
  /(?:curl|wget|fetch|nc|ncat|netcat|socat)\s+.*(?:https?:\/\/|ftps?:\/\/|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b).*(?:--data|-d|--upload-file|-T|--form|-F|@)/i,
  // Piping sensitive files into network utilities
  /(?:cat|grep|tar|zip|base64)\s+.*(?:\.env|\.ssh|\.aws|id_rsa|id_ed25519|credentials|shadow|token).*\|\s*(?:curl|wget|nc|netcat|ssh|scp)/i,
  // Webhooks and pastebins
  /(?:curl|wget)\s+.*(?:pastebin\.com|requestbin|webhook\.site|ngrok\.io|localtunnel\.me|burpcollaborator)/i,
]

// 2. Credential Probing patterns
const CREDENTIAL_PROBING_PATTERNS = [
  // SSH and AWS credential reads
  /(?:cat|head|tail|less|more|od|xxd|strings|base64)\s+.*(?:\.ssh\/id_|\.ssh\/id_rsa|\.ssh\/id_ed25519|\.aws\/credentials|\.aws\/config|\.netrc)/i,
  // System secrets
  /(?:cat|head|tail|less|more|od|xxd)\s+.*\/(?:etc\/shadow|etc\/master\.passwd|etc\/sudoers)/i,
  // macOS Keychain dumping
  /security\s+dump-keychain|security\s+find-generic-password\s+-g/i,
  // Browser credential files
  /(?:Chrome|Firefox|Safari|Brave|Edge)\/.*(?:Cookies|Login\s*Data|key4\.db|logins\.json)/i,
  // Reading environmental token dumps
  /(?:printenv|env|export)\s*\|\s*(?:grep|egrep|awk|sed).*(?:TOKEN|SECRET|PASSWORD|KEY|AUTH)/i,
]

// 3. Persistent Security Weakening patterns
const SECURITY_WEAKENING_PATTERNS = [
  // Altering sudoers or system hosts
  /(?:echo|tee|cat|sed|awk)\s+.*\>\s*.*\/(?:etc\/sudoers|etc\/sudoers\.d|etc\/hosts)/i,
  // Overly permissive permissions on root or home
  /chmod\s+(?:-R\s+)?(?:777|666|a\+rwx)\s+(?:\/|\~|\/etc|\/usr|\/var)/i,
  // Disabling security mechanisms
  /csrutil\s+disable|spctl\s+--master-disable|setenforce\s+0|ufw\s+disable|pfctl\s+-d/i,
  // Tampering with git hooks globally or in security-critical paths
  /(?:rm|echo|touch)\s+.*\.git\/hooks\/(?:pre-commit|pre-push|commit-msg)/i,
]

// 4. Destructive Actions patterns
const DESTRUCTIVE_PATTERNS = [
  // Root / Home / Broad wildcards recursive deletion
  /rm\s+-(?:rf|fr|r)\s+(?:\/|\/\*|\~|\~\/|\$HOME|\.\.|\*\.|\*)/i,
  // Disk formatting or raw device writes
  /mkfs\.|dd\s+if=.*of=\/dev\/(?:sd|hd|nvme|disk)/i,
  // Dangerous git history or branch destruction
  /git\s+push\b.*(?:--force|-f\b).*(?:main|master|production|prod|release)|git\s+push\b.*(?:main|master|production|prod|release).*(?:--force|-f\b)/i,
  /git\s+branch\s+-(?:D|d)\s+(?:main|master|production)/i,
  // Shadowing critical environment variables
  /(?:export\s+)?(?:HOME|PATH|USER)\s*=\s*(?:\/tmp|\/dev\/null|\"\"|\'\')/i,
]

export class GuardianEvaluator {
  /**
   * Evaluates an action across the four threat vectors.
   */
  public evaluateAction(action: GuardianAction): GuardianAssessment {
    const { toolName, args } = action
    const command = typeof args.command === "string" ? args.command : ""
    const targetPath = typeof args.path === "string" ? args.path : ""

    // Check Bash tool commands
    if (toolName === "bash" && command) {
      // 1. Check Destructive Actions
      for (const pattern of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(command)) {
          return {
            riskLevel: "critical",
            userAuthorization: "unknown",
            outcome: "deny",
            category: "destructive_action",
            rationale: `Destructive action pattern detected: command matches critical system disruption or broad deletion signature (${command.slice(0, 60)}).`,
            requiresApproval: true,
          }
        }
      }

      // 2. Check Security Weakening
      for (const pattern of SECURITY_WEAKENING_PATTERNS) {
        if (pattern.test(command)) {
          return {
            riskLevel: "high",
            userAuthorization: "unknown",
            outcome: "deny",
            category: "security_weakening",
            rationale: `Persistent security weakening detected: command attempts to modify security controls, hosts, or elevated privileges.`,
            requiresApproval: true,
          }
        }
      }

      // 3. Check Credential Probing
      for (const pattern of CREDENTIAL_PROBING_PATTERNS) {
        if (pattern.test(command)) {
          return {
            riskLevel: "high",
            userAuthorization: "unknown",
            outcome: "deny",
            category: "credential_probing",
            rationale: `Credential probing detected: command attempts to read private keys, keychain entries, or credential stores.`,
            requiresApproval: true,
          }
        }
      }

      // 4. Check Data Exfiltration
      for (const pattern of EXFILTRATION_PATTERNS) {
        if (pattern.test(command)) {
          return {
            riskLevel: "high",
            userAuthorization: "unknown",
            outcome: "deny",
            category: "data_exfiltration",
            rationale: `Potential data exfiltration detected: command sends sensitive payloads or local files to external endpoints.`,
            requiresApproval: true,
          }
        }
      }
    }

    // Check File mutation tools (write / edit / apply_patch)
    if (toolName === "write" || toolName === "edit" || toolName === "apply_patch") {
      // Probing or tampering with sensitive root or system files
      if (/^\/(?:etc|usr|bin|sbin|var|System|Library)/.test(targetPath)) {
        return {
          riskLevel: "critical",
          userAuthorization: "unknown",
          outcome: "deny",
          category: "security_weakening",
          rationale: `Mutating system directory outside user workspace (${targetPath}).`,
          requiresApproval: true,
        }
      }
      if (/(?:\.ssh|\.aws|\.gnupg)\//.test(targetPath)) {
        return {
          riskLevel: "high",
          userAuthorization: "unknown",
          outcome: "deny",
          category: "credential_probing",
          rationale: `Mutating user credential store (${targetPath}).`,
          requiresApproval: true,
        }
      }
    }

    // Safe by default
    return {
      riskLevel: "low",
      userAuthorization: "high",
      outcome: "allow",
      category: "safe",
      rationale: "Action verified safe according to Guardian security heuristics.",
      requiresApproval: false,
    }
  }
}

export const guardianEvaluator = new GuardianEvaluator()
