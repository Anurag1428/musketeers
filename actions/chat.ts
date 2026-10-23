"use server"

import { revalidatePath } from "next/cache"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { auth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { nanoid } from "nanoid"
import {
  chats,
  chatMembers,
  insertChatSchema,
  insertChatMemberSchema,
} from "@/lib/db/schema"
import { getDb } from "@/lib/neon-db"
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

export type CreateGroupChatInput = {
  name: string
  botIds: string[]
}

export async function createGroupChat(input: CreateGroupChatInput) {
  const { userId } = await clerkAuth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const chatId = nanoid()
  const validatedChatData = insertChatSchema.parse({
    id: chatId,
    userId,
    kind: "group",
    name: input.name.trim(),
  })

  const validatedMembers = input.botIds.map((botId) =>
    insertChatMemberSchema.parse({
      chatId,
      botId,
    })
  )

  const db = getDb()
  const [newChat] = await db.insert(chats).values(validatedChatData).returning()

  if (validatedMembers.length > 0) {
    await db.insert(chatMembers).values(validatedMembers)
  }

  revalidatePath("/", "layout")
  return newChat
}
