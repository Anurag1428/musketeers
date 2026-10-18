"use client"

import * as React from "react"
import { UserButton } from "@clerk/nextjs"
import { formatDistanceToNowStrict } from "date-fns"
import { Plus, Users } from "lucide-react"
import { BotDialog } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { ChatAvatar } from "@/component/chat-avatar"
import { getUserChats, type UserChat } from "@/queries/bot"

export interface AppSidebarProps
  extends React.ComponentProps<typeof Sidebar> {
  chats?: UserChat[]
}

export function AppSidebar({ chats: initialChats, ...props }: AppSidebarProps) {
  const [isBotDialogOpen, setIsBotDialogOpen] = React.useState(false)
  const [fetchedChats, setFetchedChats] = React.useState<UserChat[] | null>(null)

  const chats = fetchedChats ?? initialChats ?? []

  React.useEffect(() => {
    if (initialChats === undefined) {
      getUserChats().then(setFetchedChats).catch(() => {})
    }
  }, [initialChats])

  const handleRefreshChats = React.useCallback(() => {
    getUserChats().then(setFetchedChats).catch(() => {})
  }, [])

  return (
    <Sidebar {...props}>
      <SidebarHeader className="flex flex-row items-center justify-end group-data-[collapsible=icon]:justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="bg-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-transparent hover:aria-expanded:bg-muted"
              />
            }
          >
            <Plus />
            <span className="sr-only">Create</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => setIsBotDialogOpen(true)}
            >
              <Plus />
              <span>Create new bot</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Users />
              <span>Create group chat</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <BotDialog
          open={isBotDialogOpen}
          onOpenChange={setIsBotDialogOpen}
          onSuccess={handleRefreshChats}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => {
                const title = chat.name || chat.bot?.name || "Untitled"
                const avatarSeed = chat.bot?.avatar || chat.bot?.name || chat.id
                const timeAgo = chat.lastMessageAt
                  ? formatDistanceToNowStrict(new Date(chat.lastMessageAt))
                  : ""
                const preview = chat.lastMessagePreview || ""

                return (
                  <SidebarMenuItem key={chat.id}>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={title}
                      className="h-auto py-2 items-center gap-3 cursor-pointer"
                    >
                      <ChatAvatar
                        seed={avatarSeed}
                        alt={title}
                        className="size-8 shrink-0"
                      />
                      <div className="flex flex-1 flex-col min-w-0 group-data-[collapsible=icon]:hidden">
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate font-medium text-sidebar-foreground text-sm">
                            {title}
                          </span>
                          {timeAgo && (
                            <span
                              className="shrink-0 text-xs text-muted-foreground"
                              suppressHydrationWarning
                            >
                              {timeAgo}
                            </span>
                          )}
                        </div>
                        {preview && (
                          <span className="truncate text-xs text-muted-foreground">
                            {preview}
                          </span>
                        )}
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem
            className="cursor-pointer"
            onClick={(e) => {
              const trigger = e.currentTarget.querySelector<HTMLButtonElement>(
                "button.cl-userButtonTrigger, button"
              )
              if (trigger && !trigger.contains(e.target as Node)) {
                trigger.click()
              }
            }}
          >
            <SidebarMenuButton
              size="lg"
              render={<div />}
              className="cursor-pointer transition-colors"
            >
              <UserButton
                showName
                appearance={{
                  elements: {
                    rootBox: "!w-full !h-full !flex flex-1 items-center",
                    userButtonTrigger:
                      "!w-full !h-full !flex items-center !justify-start gap-2 !p-0 !bg-transparent !shadow-none !border-0 focus:outline-none focus-visible:ring-0 cursor-pointer group-data-[collapsible=icon]:!justify-center",
                    userButtonBox: "!w-full !flex flex-row gap-2 items-center",
                    userButtonOuterIdentifier:
                      "text-sm font-medium text-sidebar-foreground group-hover/menu-button:text-sidebar-accent-foreground truncate !text-left group-data-[collapsible=icon]:hidden",
                    avatarBox: "!size-[1.5rem] !w-[1.5rem] !h-[1.5rem] shrink-0 rounded-md",
                    userButtonAvatarBox: "!size-[1.5rem] !w-[1.5rem] !h-[1.5rem] shrink-0 rounded-md",
                    avatarImage: "!size-[1.5rem] !w-[1.5rem] !h-[1.5rem] rounded-md",
                    userButtonAvatarImage: "!size-[1.5rem] !w-[1.5rem] !h-[1.5rem] rounded-md",
                    userButtonPopoverCard: "pointer-events-auto",
                  },
                }}
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
