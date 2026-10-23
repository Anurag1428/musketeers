import { connection } from "next/server"
import { notFound } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { getChat } from "@/chats/queries"
import { ChatHeader } from "@/components/chat-header"
import { ChatView } from "@/components/chat-view"
import { SandboxPreview } from "@/components/sandbox-preview"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

interface ChatPageProps {
  params: Promise<{
    chatId: string
  }>
  searchParams?: Promise<{
    desktop?: string
  }>
}

export default async function ChatPage({
  params,
  searchParams,
}: ChatPageProps) {
  await connection()
  await auth.protect()

  const { chatId } = await params
  const { desktop } = (await searchParams) ?? {}
  const chat = await getChat(chatId)

  if (!chat) {
    notFound()
  }

  const isGroup = chat.kind === "group"
  const isDesktopOpen = !isGroup && (desktop === "true" || desktop === "")

  const chatBots = chat.members
    .map((m) => m.bot)
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => ({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      job: b.job,
      instructions: b.instructions,
      sandboxId: b.sandboxId,
    }))

  const botName = chat.bot?.name || chat.name || undefined
  const botJob = chat.bot?.job || undefined
  const instructions = chat.bot?.instructions || undefined
  const sandboxId = chat.bot?.sandboxId || undefined

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-svh max-h-svh flex-1 overflow-hidden"
    >
      <ResizablePanel
        defaultSize={isDesktopOpen ? "60%" : "100%"}
        className="h-full min-h-0 overflow-hidden"
      >
        <div className="flex h-full w-full flex-1 flex-col min-h-0 overflow-hidden">
          <ChatHeader chat={chat} isDesktopOpen={isDesktopOpen} />
          <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
            <ChatView
              chatId={chatId}
              botName={botName}
              botJob={botJob}
              instructions={instructions}
              sandboxId={sandboxId}
              bots={chatBots}
              isGroup={isGroup}
            />
          </main>
        </div>
      </ResizablePanel>
      {isDesktopOpen && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize="40%"
            minSize="20%"
            className="h-full min-h-0 min-w-0 overflow-hidden"
          >
            <SandboxPreview
              sandboxId={sandboxId}
              botName={botName ?? "Bot"}
            />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
