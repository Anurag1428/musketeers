import { auth } from "@clerk/nextjs/server"
import { google } from "@ai-sdk/google"
import { convertToModelMessages, streamText } from "ai"

export const maxDuration = 30

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { messages, instructions } = await req.json()

  const result = streamText({
    model: google("gemini-3.8-flash"),
    instructions: typeof instructions === "string" ? instructions : undefined,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
