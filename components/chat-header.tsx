"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Monitor } from "lucide-react"
import { ChatAvatar } from "@/components/chat-avatar"
import { BotDialog, type BotDialogBot } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import type { ChatWithBot } from "@/chats/queries"
import type { Bot } from "@/lib/db/schema"

export interface ChatHeaderProps {
  chat: ChatWithBot | {
    id?: string
    name?: string | null
    bot?: Bot | {
      id?: string
      name?: string | null
      avatar?: string | null
      job?: string | null
      instructions?: string | null
    } | null
    members?: Array<{
      bot?: Bot | {
        id?: string
        name?: string | null
        avatar?: string | null
        job?: string | null
        instructions?: string | null
      } | null
    }> | null
  }
}

export function ChatHeader({ chat }: ChatHeaderProps) {
  const router = useRouter()
  const firstMember = chat.members?.[0]
  const initialBot = firstMember?.bot ?? chat.bot
  const [currentBot, setCurrentBot] = React.useState(initialBot)

  React.useEffect(() => {
    setCurrentBot(firstMember?.bot ?? chat.bot)
  }, [chat, firstMember?.bot])

  const title = currentBot?.name || chat.name || "Chat"
  const avatarSeed =
    currentBot?.avatar || currentBot?.name || chat.id || "default"

  const editableBot: BotDialogBot | null =
    currentBot?.id && currentBot?.name
      ? {
          id: currentBot.id,
          name: currentBot.name,
          job: currentBot.job ?? "",
          avatar: currentBot.avatar ?? avatarSeed,
          instructions: currentBot.instructions ?? null,
        }
      : null

  const handleBotSuccess = (updatedBot: Bot) => {
    setCurrentBot(updatedBot)
    router.refresh()
  }

  const handleBotDelete = () => {
    router.push("/")
    router.refresh()
  }

  return (
    <header className="flex h-14 items-center justify-between border-b px-4 sm:px-6">
      {editableBot ? (
        <BotDialog
          bot={editableBot}
          onSuccess={handleBotSuccess}
          onDelete={handleBotDelete}
        >
          <Button
            variant="ghost"
            className="h-auto -ml-2 flex items-center justify-start gap-3 min-w-0 px-2 py-1.5 font-normal text-foreground hover:bg-muted cursor-pointer rounded-lg shadow-none"
          >
            <ChatAvatar
              seed={avatarSeed}
              alt={title}
              className="size-8 shrink-0"
            />
            <span className="truncate font-medium text-sm text-foreground">
              {title}
            </span>
          </Button>
        </BotDialog>
      ) : (
        <div className="flex items-center gap-3 min-w-0">
          <ChatAvatar
            seed={avatarSeed}
            alt={title}
            className="size-8 shrink-0"
          />
          <span className="truncate font-medium text-sm text-foreground">
            {title}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className="cursor-pointer"
        >
          <Monitor />
          <span className="sr-only">Desktop</span>
        </Button>
      </div>
    </header>
  )
}

export default ChatHeader
