import { chat } from "@trigger.dev/sdk/ai"
import { google } from "@ai-sdk/google"

export const chatAgent = chat.agent({
  id: "chat",
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: google("gemini-flash-lite-latest"),
      messages,
      abortSignal: signal,
    }),
})
