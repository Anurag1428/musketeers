import { connection } from "next/server"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getChat } from "@/chats/queries"
import { ChatHeader } from "@/components/chat-header"

interface ChatPageProps {
  params: Promise<{
    chatId: string
  }>
}

export default async function ChatPage({ params }: ChatPageProps) {
  await connection()
  await auth.protect()

  const { chatId } = await params
  const chat = await getChat(chatId)

  if (!chat) {
    notFound()
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <ChatHeader chat={chat} />
      <main className="flex-1 p-4 sm:p-6">
        <p className="text-muted-foreground text-sm">{chatId}</p>
      </main>
    </div>
  )
}
