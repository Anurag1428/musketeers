"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"
import { nanoid } from "nanoid"
import {
  bots,
  chats,
  chatMembers,
  insertBotSchema,
  insertChatSchema,
  insertChatMemberSchema,
} from "@/lib/db/schema"
import { getDb } from "@/lib/neon-db"

export type CreateBotInput = {
  name: string
  job: string
  avatar: string
  instructions?: string | null
}

export async function createBot(input: CreateBotInput) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const botId = nanoid()
  const chatId = nanoid()

  const validatedBotData = insertBotSchema.parse({
    ...input,
    id: botId,
    userId,
  })

  const validatedChatData = insertChatSchema.parse({
    id: chatId,
    userId,
    kind: "direct",
  })

  const validatedMemberData = insertChatMemberSchema.parse({
    chatId,
    botId,
  })

  const db = getDb()
  const [newBots] = await db.batch([
    db.insert(bots).values(validatedBotData).returning(),
    db.insert(chats).values(validatedChatData).returning(),
    db.insert(chatMembers).values(validatedMemberData).returning(),
  ])

  revalidatePath("/")

  return newBots[0]
}

