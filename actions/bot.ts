"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { createBotSandbox, deleteBotSandbox } from "@/lib/daytona"
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

  // Create Daytona sandbox for this bot
  const sandbox = await createBotSandbox({
    botId,
    userId,
    name: input.name,
  })

  try {
    const validatedBotData = insertBotSchema.parse({
      ...input,
      id: botId,
      userId,
      sandboxId: sandbox.id,
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

    revalidatePath("/", "layout")

    return newBots[0]
  } catch (error) {
    // If DB transaction fails, clean up the created sandbox to prevent orphans
    await deleteBotSandbox(sandbox.id).catch((cleanupError) => {
      console.error(
        "Failed to clean up Daytona sandbox after bot creation failure:",
        cleanupError
      )
    })
    throw error
  }
}

export type UpdateBotInput = {
  id: string
  name: string
  job: string
  avatar: string
  instructions?: string | null
}

export async function updateBot(input: UpdateBotInput) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const validatedBotData = insertBotSchema.parse({
    ...input,
    userId,
  })

  const db = getDb()
  const updatedBots = await db
    .update(bots)
    .set({
      name: validatedBotData.name,
      job: validatedBotData.job,
      avatar: validatedBotData.avatar,
      instructions: validatedBotData.instructions,
    })
    .where(and(eq(bots.id, input.id), eq(bots.userId, userId)))
    .returning()

  if (!updatedBots || updatedBots.length === 0) {
    throw new Error("Bot not found or unauthorized")
  }

  revalidatePath("/", "layout")

  return updatedBots[0]
}

export async function deleteBot(botId: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()

  // Find direct chats associated with this bot owned by this user
  const directChats = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .innerJoin(chats, eq(chatMembers.chatId, chats.id))
    .where(
      and(
        eq(chatMembers.botId, botId),
        eq(chats.userId, userId),
        eq(chats.kind, "direct")
      )
    )

  const chatIds = directChats.map((c) => c.chatId)

  // Delete the bot (verifying owner userId)
  const deletedBots = await db
    .delete(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning()

  if (!deletedBots || deletedBots.length === 0) {
    throw new Error("Bot not found or unauthorized")
  }

  const deletedBot = deletedBots[0]

  // Delete Daytona sandbox if present
  if (deletedBot.sandboxId) {
    await deleteBotSandbox(deletedBot.sandboxId)
  }

  // Also clean up any direct chats that were dedicated to this bot
  if (chatIds.length > 0) {
    await db
      .delete(chats)
      .where(and(inArray(chats.id, chatIds), eq(chats.userId, userId)))
  }

  revalidatePath("/", "layout")

  return deletedBot
}
