import { connection } from "next/server"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getChat } from "@/chats/queries"
import { ChatHeader } from "@/components/chat-header"
import { ChatView } from "@/components/chat-view"

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

  const botName = chat.bot?.name || chat.name || undefined
  const botJob = chat.bot?.job || undefined
  const instructions = chat.bot?.instructions || undefined
  const sandboxId = chat.bot?.sandboxId || undefined

  return (
    <div className="flex h-svh flex-1 flex-col overflow-hidden">
      <ChatHeader chat={chat} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatView
          chatId={chatId}
          botName={botName}
          botJob={botJob}
          instructions={instructions}
          sandboxId={sandboxId}
        />
      </main>
    </div>
  )
}
