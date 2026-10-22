"use server"

import { auth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import type { chatAgent } from "@/trigger/chat"

export const startChatSession =
  chat.createStartSessionAction<typeof chatAgent>("chat")

export async function mintChatAccessToken(chatId: string) {
  return auth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}

export const loadTranscript = chat.createLoadTranscriptAction(defaultStorage)
