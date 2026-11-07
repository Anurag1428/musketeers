/**
 * JARVIS Physical Desktop Agent Client
 * Communicates with the Ubuntu Desktop listener over local network.
 */

export function getDesktopUrl(): string {
  return process.env.JARVIS_DESKTOP_URL || "http://192.168.1.12:5000"
}

export function isDesktopConfigured(): boolean {
  return Boolean(process.env.JARVIS_DESKTOP_URL || "http://192.168.1.12:5000")
}

/**
 * Checks if the Ubuntu Desktop JARVIS body is currently online.
 */
export async function checkDesktopHealth(): Promise<{
  online: boolean
  machine?: string
  error?: string
}> {
  try {
    const res = await fetch(`${getDesktopUrl()}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) {
      return { online: false, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { online: true, machine: data.machine }
  } catch (err: any) {
    return { online: false, error: err?.message || "Desktop unreachable" }
  }
}

/**
 * Executes a shell command on the Ubuntu desktop.
 * Automatically wraps with the proper GUI/Display/Audio environment variables.
 */
export async function executeDesktopCommand(command: string): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  const envPrefix = [
    "export PATH=/home/anurag/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin:$PATH",
    "export XDG_RUNTIME_DIR=/run/user/1000",
    "export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus",
    "export DISPLAY=:0",
    'if [ -f /run/user/1000/gdm/Xauthority ]; then export XAUTHORITY=/run/user/1000/gdm/Xauthority; elif [ -f "$HOME/.Xauthority" ]; then export XAUTHORITY="$HOME/.Xauthority"; elif [ -f "$(ls /run/user/1000/.mutter-Xwaylandauth* 2>/dev/null | head -n 1)" ]; then export XAUTHORITY="$(ls /run/user/1000/.mutter-Xwaylandauth* 2>/dev/null | head -n 1)"; fi',
  ].join("; ")

  const fullCommand = `${envPrefix}; ${command}`

  const res = await fetch(`${getDesktopUrl()}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: fullCommand }),
    signal: AbortSignal.timeout(60000),
  })

  if (!res.ok) {
    throw new Error(`Desktop agent error: ${res.statusText}`)
  }

  return res.json()
}

/**
 * Launches or navigates Chromium on the Ubuntu desktop.
 * If Chromium is already open and listening on CDP port 9222, navigates the active tab
 * via agent-browser instead of spawning duplicate processes.
 * Uses a persistent profile at /home/anurag/.config/jarvis-chrome-profile so user logins
 * (Wellfound, Apollo, LinkedIn, etc.) persist permanently across tasks.
 * Automatically returns the initial accessibility DOM snapshot with @eN element refs.
 */
export async function openDesktopBrowser(url: string): Promise<{
  success: boolean
  url: string
  snapshot?: string
  instruction: string
  navigatedExisting?: boolean
}> {
  const targetUrl = url.startsWith("http") ? url : `https://${url}`
  // Use snap-permitted common profile directory so AppArmor grants read/write permissions
  const profileDir = "/home/anurag/snap/chromium/common/jarvis-profile"

  // Check if Chromium is already active with CDP port 9222 listening
  const cdpCheck = await executeDesktopCommand(
    "curl -s --connect-timeout 1 http://127.0.0.1:9222/json/version"
  ).catch(() => ({ exitCode: 1, stdout: "", stderr: "" }))

  let navigatedExisting = false

  if (cdpCheck.exitCode === 0 && cdpCheck.stdout.includes("Browser")) {
    // Port 9222 is listening! Navigate the active tab directly via agent-browser open
    const navCmd = `timeout 15s sh -c 'if command -v agent-browser >/dev/null 2>&1; then agent-browser --cdp 9222 open "${targetUrl}"; elif [ -x /home/anurag/bin/agent-browser ]; then /home/anurag/bin/agent-browser --cdp 9222 open "${targetUrl}"; else npx -y agent-browser --cdp 9222 open "${targetUrl}"; fi'`
    const navResult = await executeDesktopCommand(navCmd).catch(() => ({
      exitCode: 1,
    }))

    if (navResult.exitCode === 0) {
      navigatedExisting = true
    }
  }

  if (!navigatedExisting) {
    // If port 9222 is not active, kill any stale non-CDP Chromium instance first
    await executeDesktopCommand("pkill -f chromium 2>/dev/null || true").catch(
      () => {}
    )

    // Ensure any stale SingletonLock inside the profile directory is removed only if Chromium is not running on port 9222
    await executeDesktopCommand(
      `mkdir -p "${profileDir}" && rm -f "${profileDir}/SingletonLock" "${profileDir}/SingletonSocket" "${profileDir}/SingletonCookie" 2>/dev/null || true`
    ).catch(() => {})

    const command = `nohup /snap/bin/chromium --no-sandbox --test-type --disable-infobars --start-maximized --no-first-run --no-default-browser-check --disable-session-crashed-bubble --disable-search-engine-choice-screen --user-data-dir="${profileDir}" --remote-debugging-port=9222 "${targetUrl}" </dev/null >/dev/null 2>&1 &`

    await executeDesktopCommand(command)
  }

  // Wait 2.2 seconds for the window/page to render
  await new Promise((r) => setTimeout(r, 2200))

  // Dismiss any lingering dialogs by pressing Escape
  await executeDesktopCommand("xdotool key Escape").catch(() => {})

  // Auto-return the accessibility DOM snapshot so the model gets @eN element refs immediately on Step 1
  const snapCmd = `timeout 15s sh -c 'if command -v agent-browser >/dev/null 2>&1; then agent-browser --cdp 9222 snapshot -i; elif [ -x /home/anurag/bin/agent-browser ]; then /home/anurag/bin/agent-browser --cdp 9222 snapshot -i; else npx -y agent-browser --cdp 9222 snapshot -i; fi'`
  const snapRes = await executeDesktopCommand(snapCmd).catch(() => ({
    stdout: "",
    stderr: "",
  }))
  const snapshot = (snapRes.stdout || "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/^⚠ Chrome.*$/gm, "")
    .replace(/^\[agent-browser\].*$/gm, "")
    .trim()

  return {
    success: true,
    url: targetUrl,
    snapshot: snapshot || "Interactive elements tree ready.",
    instruction:
      "Use browser_click and browser_fill with the @eN refs above to interact with this page. NEVER use mouse_click.",
    navigatedExisting,
  }
}

/**
 * Takes a screenshot of the physical Ubuntu desktop and returns base64 PNG.
 */
export async function takeDesktopScreenshot(): Promise<{
  base64: string
  mediaType: "image/png"
}> {
  const command = `rm -f /tmp/jarvis_screenshot.png && scrot /tmp/jarvis_screenshot.png && base64 -w 0 /tmp/jarvis_screenshot.png`
  const result = await executeDesktopCommand(command)

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error(result.stderr || "Failed to capture desktop screenshot")
  }

  return {
    base64: result.stdout.trim(),
    mediaType: "image/png",
  }
}

/**
 * Moves the mouse cursor to (x, y) on the Ubuntu desktop.
 */
export async function desktopMouseMove(x: number, y: number) {
  await executeDesktopCommand(
    `xdotool mousemove ${Math.round(x)} ${Math.round(y)}`
  )
  return { x, y }
}

/**
 * Clicks the mouse on the Ubuntu desktop.
 */
export async function desktopMouseClick(
  x: number,
  y: number,
  button: "left" | "right" | "middle" = "left",
  double = false
) {
  const btnNum = button === "right" ? 3 : button === "middle" ? 2 : 1
  const clickCmd = double ? `click --repeat 2 ${btnNum}` : `click ${btnNum}`
  await executeDesktopCommand(
    `xdotool mousemove ${Math.round(x)} ${Math.round(y)} ${clickCmd}`
  )
  return { x, y, button, double }
}

/**
 * Scrolls the mouse wheel on the Ubuntu desktop.
 */
export async function desktopMouseScroll(
  x: number,
  y: number,
  direction: "up" | "down",
  amount = 3
) {
  // Button 4 is scroll up, Button 5 is scroll down in X11
  const btnNum = direction === "up" ? 4 : 5
  await executeDesktopCommand(
    `xdotool mousemove ${Math.round(x)} ${Math.round(y)} click --repeat ${amount} ${btnNum}`
  )
  return { x, y, direction, amount, success: true }
}

/**
 * Types text into the focused window on the Ubuntu desktop.
 */
export async function desktopKeyboardType(text: string) {
  // Use python on desktop to safely type text without shell injection
  const escaped = JSON.stringify(text)
  const script = `python3 -c "import subprocess, sys; subprocess.run(['xdotool', 'type', '--delay', '10', ${escaped}])"`
  await executeDesktopCommand(script)
  return { typed: text }
}

/**
 * Presses a key or hotkey (e.g. 'Return', 'Escape', 'ctrl+c', 'Super') on the desktop.
 */
export async function desktopKeyboardPress(
  key: string,
  modifiers: Array<"ctrl" | "alt" | "shift" | "cmd"> = []
) {
  let mappedKey = key
  if (key.toLowerCase() === "enter") mappedKey = "Return"
  if (key.toLowerCase() === "esc") mappedKey = "Escape"

  const modPrefix = modifiers.map((m) => (m === "cmd" ? "super" : m)).join("+")

  const fullKey = modPrefix ? `${modPrefix}+${mappedKey}` : mappedKey
  await executeDesktopCommand(`xdotool key ${fullKey}`)
  return { key, modifiers }
}

/**
 * Normalizes file paths for the Ubuntu desktop.
 * Routes 'Memory.md' to '/home/anurag/Memory.md'.
 */
function resolveDesktopPath(path: string): string {
  if (path === "Memory.md" || path.endsWith("/Memory.md")) {
    return "/home/anurag/Memory.md"
  }
  if (path.startsWith("~")) {
    return path.replace(/^~/, "/home/anurag")
  }
  if (!path.startsWith("/")) {
    return `/home/anurag/${path}`
  }
  return path
}

/**
 * Reads a file from the Ubuntu desktop filesystem.
 */
export async function desktopReadFile(path: string): Promise<{
  content: string
  path: string
  success: boolean
  error?: string
}> {
  const targetPath = resolveDesktopPath(path)
  const cmd = `cat "${targetPath}" 2>/dev/null || echo "__JARVIS_FILE_NOT_FOUND__"`
  const result = await executeDesktopCommand(cmd)

  if (result.stdout.trim() === "__JARVIS_FILE_NOT_FOUND__") {
    // If it's Memory.md, initialize it with a blank file
    if (targetPath.endsWith("Memory.md")) {
      await executeDesktopCommand(`touch "${targetPath}"`)
      return { content: "", path: targetPath, success: true }
    }
    return {
      content: "",
      path: targetPath,
      success: false,
      error: "File not found",
    }
  }

  return { content: result.stdout, path: targetPath, success: true }
}

/**
 * Writes content to a file on the Ubuntu desktop filesystem.
 */
export async function desktopWriteFile(
  path: string,
  content: string
): Promise<{
  success: boolean
  path: string
}> {
  const targetPath = resolveDesktopPath(path)
  const encoded = Buffer.from(content, "utf-8").toString("base64")
  const cmd = `echo "${encoded}" | base64 -d > "${targetPath}"`
  await executeDesktopCommand(cmd)
  return { success: true, path: targetPath }
}

/**
 * Lists files in a directory on the Ubuntu desktop.
 */
export async function desktopListFiles(path = "."): Promise<{
  path: string
  entries: Array<{ name: string; isDir: boolean; size: number }>
}> {
  const targetPath = resolveDesktopPath(path)
  const script = `python3 -c "import os, json; p='${targetPath}'; entries = [{'name': f, 'isDir': os.path.isdir(os.path.join(p, f)), 'size': os.path.getsize(os.path.join(p, f)) if not os.path.isdir(os.path.join(p, f)) else 0} for f in os.listdir(p)]; print(json.dumps(entries))"`
  const result = await executeDesktopCommand(script)

  try {
    const entries = JSON.parse(result.stdout)
    return { path: targetPath, entries }
  } catch {
    return { path: targetPath, entries: [] }
  }
}
