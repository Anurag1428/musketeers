"use server"

import { auth } from "@clerk/nextjs/server"
import { getDaytonaClient } from "@/lib/daytona"

export type FetchSandboxVncUrlResult = {
  success: boolean
  url?: string
  baseUrl?: string
  error?: string
}

export async function fetchSandboxVncUrl(
  sandboxId: string
): Promise<FetchSandboxVncUrlResult> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  if (!sandboxId?.trim()) {
    return { success: false, error: "No sandbox ID provided" }
  }

  try {
    const daytona = getDaytonaClient()
    const sandbox = await daytona.get(sandboxId.trim())

    if (sandbox.state !== "started") {
      await sandbox.start()
    }

    try {
      const status = await sandbox.computerUse.getStatus()
      if (status.status !== "active") {
        await sandbox.computerUse.start()
      }
    } catch (cuError) {
      console.warn("Could not check/start computerUse:", cuError)
      try {
        await sandbox.computerUse.start()
      } catch {}
    }

    // Get signed preview URL for noVNC on port 6080, valid for 24 hours (86400 seconds)
    const signedPreview = await sandbox.getSignedPreviewUrl(6080, 86400)
    const baseUrl = signedPreview.url.replace(/\/$/, "")
    const url = `${baseUrl}/vnc.html?autoconnect=true&resize=scale`

    return { success: true, url, baseUrl }
  } catch (error) {
    console.error(`Failed to fetch VNC URL for sandbox ${sandboxId}:`, error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load sandbox VNC preview",
    }
  }
}
