import { executeDesktopCommand } from "./desktop-agent"

export interface BrowserActionResult {
  success: boolean
  output?: string
  error?: string
}

/**
 * Strips terminal ANSI color codes and warnings for clean LLM ingestion.
 */
export function cleanSnapshotOutput(raw: string): string {
  return raw
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/^⚠ Chrome.*$/gm, "")
    .replace(/^\[agent-browser\].*$/gm, "")
    .trim()
}

/**
 * Runs an agent-browser command in a Daytona sandbox via CDP on port 9222.
 * Wrapped with a 15-second timeout to prevent hanging on unparseable pages or disconnected CDP.
 */
export async function executeSandboxBrowserCommand(
  sandbox: any,
  subcommand: string
): Promise<BrowserActionResult> {
  try {
    // Check local binary first, then fall back to npx
    const fullCommand = `timeout 15s sh -c 'if command -v agent-browser >/dev/null 2>&1; then agent-browser --cdp 9222 ${subcommand}; elif [ -x /root/bin/agent-browser ]; then /root/bin/agent-browser --cdp 9222 ${subcommand}; else npx -y agent-browser --cdp 9222 ${subcommand}; fi'`
    const res = await sandbox.process.executeCommand(fullCommand)
    const stdout = cleanSnapshotOutput(res.result ?? "")

    if (res.exitCode === 124) {
      return {
        success: false,
        error:
          "agent-browser command timed out after 15s on CDP port 9222. Page may be unparseable; please fall back to view_screen or retry.",
      }
    }

    return {
      success: res.exitCode === 0,
      output: stdout,
      error: res.exitCode !== 0 ? stdout || "Command failed" : undefined,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to execute sandbox browser command",
    }
  }
}

/**
 * Runs an agent-browser command on the physical Ubuntu desktop via CDP on port 9222.
 * Wrapped with a 15-second timeout to prevent hanging on unparseable pages or disconnected CDP.
 */
export async function executeDesktopBrowserCommand(
  subcommand: string
): Promise<BrowserActionResult> {
  try {
    // Try local binary, /home/anurag/bin, or npx with a 15s timeout
    const fullCommand = `timeout 15s sh -c 'if command -v agent-browser >/dev/null 2>&1; then agent-browser --cdp 9222 ${subcommand}; elif [ -x /home/anurag/bin/agent-browser ]; then /home/anurag/bin/agent-browser --cdp 9222 ${subcommand}; else npx -y agent-browser --cdp 9222 ${subcommand}; fi'`
    const res = await executeDesktopCommand(fullCommand)
    const stdout = cleanSnapshotOutput(res.stdout ?? "")

    if (res.exitCode === 124) {
      return {
        success: false,
        error:
          "agent-browser command timed out after 15s on CDP port 9222. Page may be unparseable; please fall back to view_screen or retry.",
      }
    }

    return {
      success: res.exitCode === 0,
      output: stdout,
      error:
        res.exitCode !== 0
          ? res.stderr || stdout || "Command failed"
          : undefined,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to execute desktop browser command",
    }
  }
}
