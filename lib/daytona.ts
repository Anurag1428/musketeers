import { Daytona, DaytonaNotFoundError } from "@daytona/sdk"

export function getDaytonaClient() {
  const apiKey = process.env.DAYTONA_API_KEY
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is not set in environment")
  }

  return new Daytona({
    apiKey,
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
  })
}

export interface CreateBotSandboxParams {
  botId: string
  userId: string
  name?: string
}

/**
 * Creates an isolated cloud sandbox for a bot.
 * Note: Does not start or invoke the sandbox.
 */
export async function createBotSandbox(params: CreateBotSandboxParams) {
  const daytona = getDaytonaClient()
  return await daytona.create({
    labels: {
      botId: params.botId,
      userId: params.userId,
    },
  })
}

/**
 * Deletes a sandbox for a bot if sandboxId is present.
 * Fails gracefully if the sandbox is already deleted or not found.
 */
export async function deleteBotSandbox(sandboxId: string | null | undefined) {
  if (!sandboxId) return

  try {
    const daytona = getDaytonaClient()
    const sandbox = await daytona.get(sandboxId)
    await sandbox.delete()
  } catch (error) {
    if (error instanceof DaytonaNotFoundError) {
      // Sandbox already deleted or not found
      return
    }
    console.error(`Failed to delete Daytona sandbox (${sandboxId}):`, error)
  }
}
