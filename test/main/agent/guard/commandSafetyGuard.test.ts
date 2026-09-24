import type { PermissionSettings } from "@shared/contracts/agent"
import { describe, expect, it, vi } from "vitest"
import { evaluateCommandSafety, unwrapCommand } from "@/agent/guard/commandSafetyGuard"

const holder = vi.hoisted(() => ({
  permissionSettings: {
    defaultMode: "default",
    allow: [],
    deny: [],
    ask: [],
  } as PermissionSettings,
}))

vi.mock("@/services/settingsService", () => ({
  getPermissionSettings: () => holder.permissionSettings,
  savePermissionSettings: (input: PermissionSettings) => {
    holder.permissionSettings = input
    return input
  },
}))

import { permissionManager } from "@/agent/permissions/permissionManager"

describe("CommandSafetyGuard", () => {
  it("正确拆解 shell 封装层 (sudo, env, sh -c)", () => {
    expect(unwrapCommand("sudo rm -rf /")).toBe("rm -rf /")
    expect(unwrapCommand("env FOO=bar sudo sh -c 'git reset --hard'")).toBe("git reset --hard")
    expect(unwrapCommand("bash -c \"zsh -c 'git clean -fd'\"")).toBe("git clean -fd")
  })

  it("精准识别绝对破坏性危险指令 (dangerous -> deny)", () => {
    expect(evaluateCommandSafety("rm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("sudo rm -rf ~").level).toBe("dangerous")
    expect(evaluateCommandSafety("git reset --hard").level).toBe("dangerous")
    expect(evaluateCommandSafety("git clean -fdx").level).toBe("dangerous")
    expect(evaluateCommandSafety("mkfs.ext4 /dev/sda1").level).toBe("dangerous")
  })

  it("精准识别敏感需确认指令 (sensitive -> ask)", () => {
    expect(evaluateCommandSafety("git push --force origin main").level).toBe("sensitive")
    expect(evaluateCommandSafety("git checkout -- .").level).toBe("sensitive")
    expect(evaluateCommandSafety("chmod -R 777 /app").level).toBe("sensitive")
    expect(evaluateCommandSafety("reboot").level).toBe("sensitive")
  })

  it("安全指令正常放行 (safe)", () => {
    expect(evaluateCommandSafety("git status").level).toBe("safe")
    expect(evaluateCommandSafety("npm test").level).toBe("safe")
    expect(evaluateCommandSafety("pnpm build").level).toBe("safe")
  })

  it("放行仅丢弃输出与 fd 复制的重定向 (>/dev/null, 2>&1)", () => {
    expect(evaluateCommandSafety("npm run build > /dev/null").level).toBe("safe")
    expect(evaluateCommandSafety("npm run build >/dev/null 2>&1").level).toBe("safe")
    expect(evaluateCommandSafety("npm run build 2>/dev/null").level).toBe("safe")
    expect(evaluateCommandSafety("npm run build &>/dev/null").level).toBe("safe")
    expect(evaluateCommandSafety("npm run build 2>>/dev/null").level).toBe("safe")
  })

  it("拦截写入真实文件的重定向 (> file, >> file)", () => {
    expect(evaluateCommandSafety("echo hello > out.txt").level).toBe("dangerous")
    expect(evaluateCommandSafety("echo hello >> out.txt").level).toBe("dangerous")
    expect(evaluateCommandSafety("npm run build 2> build.log").level).toBe("dangerous")
    expect(evaluateCommandSafety("npm run build &> build.log").level).toBe("dangerous")
    expect(evaluateCommandSafety("node script.js >/tmp/out.log 2>&1").level).toBe("dangerous")
  })

  it("引号内的 > 不视为重定向，引号包裹的文件目标仍拦截", () => {
    expect(evaluateCommandSafety("git log --grep='a > b' --oneline -1").level).toBe("safe")
    expect(evaluateCommandSafety('grep "a > b" file.txt').level).toBe("safe")
    expect(evaluateCommandSafety("echo a \\> b").level).toBe("safe")
    expect(evaluateCommandSafety("echo x > '/dev/null'").level).toBe("safe")
    expect(evaluateCommandSafety('echo "x" > "out file.txt"').level).toBe("dangerous")
  })

  it("内容改写命令与重定向同级硬拦 (tee file, sed -i, truncate)", () => {
    expect(evaluateCommandSafety("pnpm test | tee test.log").level).toBe("dangerous")
    expect(evaluateCommandSafety("sed -i 's/a/b/' src/a.ts").level).toBe("dangerous")
    expect(evaluateCommandSafety("sed -i.bak 's/a/b/' src/a.ts").level).toBe("dangerous")
    expect(evaluateCommandSafety("truncate -s 0 logs.txt").level).toBe("dangerous")
    expect(evaluateCommandSafety("pnpm test | tee").level).toBe("safe")
    expect(evaluateCommandSafety("pnpm test | tee /dev/null").level).toBe("safe")
    expect(evaluateCommandSafety("sed -n '1,5p' src/a.ts").level).toBe("safe")
  })

  it("heredoc 正文按数据处理，不参与命令扫描", () => {
    expect(evaluateCommandSafety("cat <<'EOF' >/dev/null\na > b | c\nEOF").level).toBe("safe")
    expect(evaluateCommandSafety("cat <<-EOF >/dev/null\n\ta > b\n\tEOF").level).toBe("safe")
    expect(evaluateCommandSafety("cat << EOF >/dev/null\nbody\nEOF").level).toBe("safe")
    expect(evaluateCommandSafety("cat <<< 'a > b' >/dev/null").level).toBe("safe")
    // 命令行自身的重定向与终止符之后的真实命令仍拦截
    expect(evaluateCommandSafety("cat <<'EOF' > out.txt\nbody\nEOF").level).toBe("dangerous")
    expect(evaluateCommandSafety("cat <<'EOF' >/dev/null && rm -rf /\nbody\nEOF").level).toBe(
      "dangerous",
    )
  })

  it("命令替换正文会被 shell 执行，必须纳入扫描", () => {
    // 未加引号分隔符的 heredoc：正文做命令替换
    expect(
      evaluateCommandSafety("cat <<EOF >/dev/null\n$(echo pwn > /tmp/lx-h1.txt)\nEOF").level,
    ).toBe("dangerous")
    // 加引号的分隔符：正文是字面量，不展开
    expect(
      evaluateCommandSafety("cat <<'EOF' >/dev/null\n$(echo pwn > /tmp/lx-h1.txt)\nEOF").level,
    ).toBe("safe")
    // 双引号内 $() 仍会执行
    expect(evaluateCommandSafety('echo "$(echo pwn > /tmp/lx-k1.txt)"').level).toBe("dangerous")
    expect(evaluateCommandSafety("echo \"$(sed -i 's/a/b/' f.ts)\"").level).toBe("dangerous")
    expect(evaluateCommandSafety("echo $(pnpm test | tee test.log)").level).toBe("dangerous")
    // 普通替换与算术展开放行
    expect(evaluateCommandSafety('git commit -m "$(cat msg.txt)"').level).toBe("safe")
    expect(evaluateCommandSafety("echo $(date)").level).toBe("safe")
    expect(evaluateCommandSafety("echo $((a > b))").level).toBe("safe")
    expect(evaluateCommandSafety("echo $((x >> 2))").level).toBe("safe")
  })

  it("危险模式限定在单条子命令内，不跨 ; | & 误拼", () => {
    expect(evaluateCommandSafety("rm -f /tmp/lx-nonexist; ls test/").level).toBe("safe")
    expect(evaluateCommandSafety("rm -fr build; ls /").level).toBe("safe")
    expect(evaluateCommandSafety("rm -f x & ls /").level).toBe("safe")
    expect(evaluateCommandSafety("git clean -n; git checkout -f").level).toBe("safe")
    // 真实形态仍拦截
    expect(evaluateCommandSafety("rm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -rf / ; ls").level).toBe("dangerous")
  })

  it("rm 受保护目标加引号/变量同样硬拦", () => {
    expect(evaluateCommandSafety('rm -rf "/"').level).toBe("dangerous")
    expect(evaluateCommandSafety('rm -rf ".."').level).toBe("dangerous")
    expect(evaluateCommandSafety('rm -rf "~"').level).toBe("dangerous")
    expect(evaluateCommandSafety('rm -rf "$HOME"').level).toBe("dangerous")
    expect(evaluateCommandSafety('rm -rf "${HOME}"').level).toBe("dangerous")
    expect(evaluateCommandSafety('sudo rm -rf "/"').level).toBe("dangerous")
    expect(evaluateCommandSafety('rm -rf "/" ; ls').level).toBe("dangerous")
  })

  it("rm 的通配/相对根拼写同样硬拦", () => {
    expect(evaluateCommandSafety("rm -rf /*").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -rf /./*").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -rf ./*").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -rf .").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -rf -- ..").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -fr ..").level).toBe("dangerous")
    expect(evaluateCommandSafety("sh -c 'rm -rf /'").level).toBe("dangerous")
  })

  it("rm 常规目标不被硬拦", () => {
    expect(evaluateCommandSafety("rm -rf node_modules").level).toBe("safe")
    expect(evaluateCommandSafety("rm -rf /tmp/build/*").level).toBe("safe")
    expect(evaluateCommandSafety("rm -rf build/*").level).toBe("safe")
    expect(evaluateCommandSafety("rm -rf ../build").level).toBe("safe")
    expect(evaluateCommandSafety("rm -rf /tmp/x").level).toBe("safe")
    expect(evaluateCommandSafety("rm -f /tmp/x").level).toBe("safe")
  })

  it("敏感模式同样做引号归一化", () => {
    expect(evaluateCommandSafety('git push "--force" origin main').level).toBe("sensitive")
    expect(evaluateCommandSafety('git reset "--hard"').level).toBe("dangerous")
  })

  it("换行与后台分隔不构成绕过", () => {
    expect(evaluateCommandSafety("true\ngit reset --hard").level).toBe("dangerous")
    expect(evaluateCommandSafety("true\nrm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("echo ok\r\ngit clean -fdx").level).toBe("dangerous")
    expect(evaluateCommandSafety("git reset --hard & echo ok").level).toBe("dangerous")
    expect(evaluateCommandSafety("echo a\necho b").level).toBe("safe")
  })

  it("shell -c 组合参数、eval/command 与引号命令名不构成绕过", () => {
    expect(evaluateCommandSafety("bash -lc 'rm -rf /'").level).toBe("dangerous")
    expect(evaluateCommandSafety('sh -ic "git reset --hard"').level).toBe("dangerous")
    expect(evaluateCommandSafety("bash -l -c 'rm -rf /'").level).toBe("dangerous")
    expect(evaluateCommandSafety("eval 'rm -rf /'").level).toBe("dangerous")
    expect(evaluateCommandSafety('eval "git reset --hard"').level).toBe("dangerous")
    expect(evaluateCommandSafety("command rm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("'rm' -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety('"rm" -rf /').level).toBe("dangerous")
    expect(evaluateCommandSafety("\\rm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("RM -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("rm -RF /").level).toBe("dangerous")
    expect(evaluateCommandSafety("SUDO rm -rf /").level).toBe("dangerous")
    expect(evaluateCommandSafety("bash -lc 'git status'").level).toBe("safe")
    expect(evaluateCommandSafety("eval 'echo hi'").level).toBe("safe")
    expect(evaluateCommandSafety("command -v rm").level).toBe("safe")
  })

  it("wrapper 展开后引号内的重定向仍被拦截", () => {
    expect(evaluateCommandSafety("sh -c 'echo p > /tmp/lx-out.txt'").level).toBe("dangerous")
    expect(evaluateCommandSafety('bash -lc "echo x >> log.txt"').level).toBe("dangerous")
    expect(evaluateCommandSafety("sh -c 'echo x > /dev/null'").level).toBe("safe")
  })

  it("多行引号参数不被肢解：引号内的 > 不是写文件重定向", () => {
    // 回归：python3 -c "多行 HTML" 里的 <title>x</title> 曾被顶层盲拆后误判为写文件重定向
    expect(
      evaluateCommandSafety(
        `python3 -c "\nhtml = '<title>x</title>'\nopen('f.html','w').write(html)\n"`,
      ).level,
    ).toBe("safe")
    expect(evaluateCommandSafety(`python3 -c "\nif 10 > 5:\n    print('ok')"`).level).toBe("safe")
    // 引号内的真实写操作仍按命令评估（sh -c 载荷递归检查）
    expect(evaluateCommandSafety(`sh -c "echo a > b" && echo ok`).level).toBe("dangerous")
  })

  it("引号内的分隔符载荷仍纳入评估，不因拆分修复而漏判", () => {
    expect(evaluateCommandSafety('sh -c "cd /tmp && rm -rf /"').level).toBe("dangerous")
    expect(evaluateCommandSafety('sh -c "ls; git reset --hard"').level).toBe("dangerous")
  })

  it("常见文件操作指令不做硬拦截，交由权限确认流程", () => {
    expect(evaluateCommandSafety("touch index.ts").level).toBe("safe")
    expect(evaluateCommandSafety("mkdir -p src/features").level).toBe("safe")
    expect(evaluateCommandSafety("cp a.ts b.ts").level).toBe("safe")
    expect(evaluateCommandSafety("mv a.ts b.ts").level).toBe("safe")
    expect(evaluateCommandSafety("git commit -m 'fix: a -> b'").level).toBe("safe")
  })

  it("PermissionManager 集成 CommandSafetyGuard 正确判定", () => {
    holder.permissionSettings = {
      defaultMode: "default",
      allow: ["Bash(git push --force*)"],
      deny: [],
      ask: [],
    }
    permissionManager.load()

    // 危险指令直接 deny
    expect(permissionManager.evaluate("bash", { command: "rm -rf /" })).toBe("deny")
    expect(permissionManager.evaluate("bash", { command: "git reset --hard HEAD~1" })).toBe("deny")

    // 敏感指令即使在 allow 规则中也提升为 ask
    expect(permissionManager.evaluate("bash", { command: "git push --force origin main" })).toBe(
      "ask",
    )

    // rm -f 不硬拦：默认走审批（ask）；rm -rf 作用于 /、~、..、* 等绝对破坏形态仍硬拦
    expect(permissionManager.evaluate("bash", { command: "rm -f /tmp/x" })).toBe("ask")
  })
})
