import { connection } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { Plus } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { BotDialog } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { ChatAvatar } from "@/component/chat-avatar"

export default async function Page() {
  await connection()
  await auth.protect()
  const seed = crypto.randomUUID()

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4 sm:px-6">
        <SidebarTrigger />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Empty>
          <EmptyHeader>
            <ChatAvatar seed={seed} animated className="mb-2 size-10" />
            <EmptyTitle>Meet your first bot</EmptyTitle>
            <EmptyDescription>
              Every bot gets its own personality, memory, and face. Spin one up
              and start the conversation.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <BotDialog>
              <Button variant="secondary">
                <Plus data-icon="inline-start" />
                Create a new bot
              </Button>
            </BotDialog>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  )
}
