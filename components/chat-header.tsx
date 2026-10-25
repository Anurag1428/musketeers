"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Monitor } from "lucide-react"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { BotDialog, type BotDialogBot } from "@/components/bot-dialog"
import {
  GroupChatDialog,
  type GroupChatDialogChat,
} from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import type { ChatWithBot } from "@/chats/queries"
import type { Bot, Chat } from "@/lib/db/schema"

export interface ChatHeaderProps {
  chat: ChatWithBot | {
    id?: string
    kind?: "direct" | "group"
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
  isDesktopOpen?: boolean
  onToggleDesktop?: () => void
}

export function ChatHeader({
  chat,
  isDesktopOpen: isDesktopOpenProp,
  onToggleDesktop,
}: ChatHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isGroup =
    ("kind" in chat && chat.kind === "group") ||
    Boolean(chat.members && chat.members.length > 1)

  const isDesktop =
    isDesktopOpenProp ??
    (searchParams.get("desktop") === "true" || searchParams.has("desktop"))

  const handleToggleDesktop = () => {
    if (onToggleDesktop) {
      onToggleDesktop()
      return
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    if (isDesktop) {
      nextParams.delete("desktop")
    } else {
      nextParams.set("desktop", "true")
    }
    const query = nextParams.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const chatBots = React.useMemo(() => {
    return (
      chat.members
        ?.map((m) => m.bot)
        .filter((b): b is NonNullable<typeof b> => Boolean(b)) ?? []
    )
  }, [chat.members])

  const firstMember = chat.members?.[0]
  const initialBot = firstMember?.bot ?? chat.bot
  const [currentBot, setCurrentBot] = React.useState(initialBot)
  const [currentGroupName, setCurrentGroupName] = React.useState<string | null | undefined>(
    isGroup ? chat.name : null
  )

  React.useEffect(() => {
    if (!isGroup) {
      setCurrentBot(firstMember?.bot ?? chat.bot)
    } else {
      setCurrentGroupName(chat.name)
    }
  }, [chat, firstMember?.bot, isGroup])

  const title = isGroup
    ? currentGroupName || chat.name || "Group Chat"
    : currentBot?.name || chat.name || "Chat"
  const avatarSeed =
    currentBot?.avatar || currentBot?.name || chat.id || "default"

  const editableBot: BotDialogBot | null =
    !isGroup && currentBot?.id && currentBot?.name
      ? {
          id: currentBot.id,
          name: currentBot.name,
          job: currentBot.job ?? "",
          avatar: currentBot.avatar ?? avatarSeed,
          instructions: currentBot.instructions ?? null,
        }
      : null

  const editableGroup: GroupChatDialogChat | null =
    isGroup && chat.id
      ? {
          id: chat.id,
          name: currentGroupName ?? chat.name ?? "Group Chat",
          botIds: chatBots
            .map((b) => b.id)
            .filter((id): id is string => Boolean(id)),
          bots: chatBots.filter(
            (b): b is { id: string; name: string; avatar?: string | null; job?: string | null } =>
              Boolean(b.id && b.name)
          ),
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

  const handleGroupChatSuccess = (updatedChat: Chat) => {
    setCurrentGroupName(updatedChat.name)
    router.refresh()
  }

  const handleGroupChatDelete = () => {
    router.push("/")
    router.refresh()
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
      {isGroup && editableGroup ? (
        <GroupChatDialog
          chat={editableGroup}
          onSuccess={handleGroupChatSuccess}
          onDelete={handleGroupChatDelete}
        >
          <Button
            variant="ghost"
            className="h-auto -ml-2 flex items-center justify-start gap-3 min-w-0 px-2 py-1.5 font-normal text-foreground hover:bg-muted cursor-pointer rounded-lg shadow-none"
          >
            <GroupChatAvatar
              bots={chatBots}
              alt={title}
              className="size-8 shrink-0"
            />
            <span className="truncate font-medium text-sm text-foreground">
              {title}
            </span>
          </Button>
        </GroupChatDialog>
      ) : isGroup ? (
        <div className="flex items-center gap-3 min-w-0">
          <GroupChatAvatar
            bots={chatBots}
            alt={title}
            className="size-8 shrink-0"
          />
          <span className="truncate font-medium text-sm text-foreground">
            {title}
          </span>
        </div>
      ) : editableBot ? (
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

      {!isGroup && (
        <div className="flex items-center gap-2">
          <Button
            variant={isDesktop ? "secondary" : "ghost"}
            size="icon-sm"
            type="button"
            onClick={handleToggleDesktop}
            aria-expanded={isDesktop}
            aria-label="Toggle desktop panel"
            className="cursor-pointer"
          >
            <Monitor />
            <span className="sr-only">Desktop</span>
          </Button>
        </div>
      )}
    </header>
  )
}

export default ChatHeader
