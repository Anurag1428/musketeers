"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@clerk/nextjs/server"
import { bots, insertBotSchema } from "@/lib/db/schema"
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

  const validatedData = insertBotSchema.parse({
    ...input,
    userId,
  })

  const db = getDb()
  const [newBot] = await db.insert(bots).values(validatedData).returning()

  revalidatePath("/")

  return newBot
}
