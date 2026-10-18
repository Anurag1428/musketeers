"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq } from "drizzle-orm"
import { bots, chatMembers, chats, type Bot, type Chat } from "@/lib/db/schema"
import { getDb } from "@/lib/neon-db"

export type ChatBot = Bot

export type ChatMemberWithBot = {
  chatId: string
  botId: string
  joinedAt: Date
  bot: Bot | null
}

export type ChatWithBot = Chat & {
  members: ChatMemberWithBot[]
  bot: Bot | null
}

export async function getChat(chatId: string): Promise<ChatWithBot | null> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()
  const rows = await db
    .select({
      chat: chats,
      member: chatMembers,
      bot: bots,
    })
    .from(chats)
    .leftJoin(chatMembers, eq(chats.id, chatMembers.chatId))
    .leftJoin(bots, eq(chatMembers.botId, bots.id))
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))

  if (rows.length === 0) {
    return null
  }

  const firstRow = rows[0]
  const members: ChatMemberWithBot[] = []

  for (const row of rows) {
    if (row.member && row.bot) {
      members.push({
        chatId: row.member.chatId,
        botId: row.member.botId,
        joinedAt: row.member.joinedAt,
        bot: row.bot,
      })
    }
  }

  return {
    ...firstRow.chat,
    members,
    bot: members[0]?.bot ?? null,
  }
}

export const getChatById = getChat
