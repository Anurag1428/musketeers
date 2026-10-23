"use server"

import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"
import { bots, chatMembers, chats } from "@/lib/db/schema"
import { getDb } from "@/lib/neon-db"

export type UserChatBot = {
  id: string
  name: string
  avatar: string
  job: string
  instructions: string | null
  sandboxId: string | null
}

export type UserChat = {
  id: string
  userId: string
  kind: "direct" | "group"
  name: string | null
  lastMessagePreview: string | null
  lastMessageAt: Date
  createdAt: Date
  bot: UserChatBot | null
  bots: UserChatBot[]
}

export async function getUserChats(): Promise<UserChat[]> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()
  const rows = await db
    .select({
      chat: chats,
      bot: {
        id: bots.id,
        name: bots.name,
        avatar: bots.avatar,
        job: bots.job,
        instructions: bots.instructions,
        sandboxId: bots.sandboxId,
      },
    })
    .from(chats)
    .leftJoin(chatMembers, eq(chats.id, chatMembers.chatId))
    .leftJoin(bots, eq(chatMembers.botId, bots.id))
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.lastMessageAt), desc(chats.createdAt))

  const chatMap = new Map<string, UserChat>()

  for (const row of rows) {
    const rowBot =
      row.bot && row.bot.id && row.bot.name && row.bot.avatar && row.bot.job
        ? {
            id: row.bot.id,
            name: row.bot.name,
            avatar: row.bot.avatar,
            job: row.bot.job,
            instructions: row.bot.instructions,
            sandboxId: row.bot.sandboxId,
          }
        : null

    let existing = chatMap.get(row.chat.id)
    if (!existing) {
      existing = {
        id: row.chat.id,
        userId: row.chat.userId,
        kind: row.chat.kind,
        name: row.chat.name,
        lastMessagePreview: row.chat.lastMessagePreview,
        lastMessageAt: row.chat.lastMessageAt,
        createdAt: row.chat.createdAt,
        bot: rowBot,
        bots: [],
      }
      chatMap.set(row.chat.id, existing)
    }
    if (rowBot && !existing.bots.some((b) => b.id === rowBot.id)) {
      existing.bots.push(rowBot)
    }
  }

  return Array.from(chatMap.values())
}

export const getChats = getUserChats

export async function getUserBots() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()
  return db
    .select()
    .from(bots)
    .where(eq(bots.userId, userId))
    .orderBy(desc(bots.createdAt))
}

export const getBots = getUserBots
