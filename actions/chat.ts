"use server"

import { revalidatePath } from "next/cache"
import { auth as clerkAuth } from "@clerk/nextjs/server"
import { auth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { and, eq } from "drizzle-orm"
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

export type UpdateGroupChatInput = {
  id: string
  name: string
  botIds: string[]
}

export async function updateGroupChat(input: UpdateGroupChatInput) {
  const { userId } = await clerkAuth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error("Name is required")
  }

  if (!input.botIds || input.botIds.length === 0) {
    throw new Error("Select at least one bot")
  }

  const validatedChatData = insertChatSchema.parse({
    id: input.id,
    userId,
    kind: "group",
    name: trimmedName,
  })

  const validatedMembers = input.botIds.map((botId) =>
    insertChatMemberSchema.parse({
      chatId: input.id,
      botId,
    })
  )

  const db = getDb()

  const existingChats = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, input.id), eq(chats.userId, userId)))
    .limit(1)

  if (!existingChats || existingChats.length === 0) {
    throw new Error("Group chat not found or unauthorized")
  }

  const [updatedChat] = await db
    .update(chats)
    .set({
      name: validatedChatData.name,
    })
    .where(and(eq(chats.id, input.id), eq(chats.userId, userId)))
    .returning()

  // Replace members: delete existing and insert updated members
  await db.delete(chatMembers).where(eq(chatMembers.chatId, input.id))

  if (validatedMembers.length > 0) {
    await db.insert(chatMembers).values(validatedMembers)
  }

  revalidatePath("/", "layout")
  revalidatePath(`/chats/${input.id}`)

  return updatedChat
}

export async function deleteGroupChat(chatId: string) {
  const { userId } = await clerkAuth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const db = getDb()

  const deletedChats = await db
    .delete(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .returning()

  if (!deletedChats || deletedChats.length === 0) {
    throw new Error("Group chat not found or unauthorized")
  }

  revalidatePath("/", "layout")

  return deletedChats[0]
}

export const deleteChat = deleteGroupChat
