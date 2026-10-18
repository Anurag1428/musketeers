"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { UserButton } from "@clerk/nextjs"
import { formatDistanceToNowStrict } from "date-fns"
import { Plus, Search, Users } from "lucide-react"
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
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Kbd } from "@/components/ui/kbd"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ChatAvatar } from "@/component/chat-avatar"
import { getUserChats, type UserChat } from "@/queries/bot"
import { cn } from "@/lib/utils"

export interface AppSidebarProps
  extends React.ComponentProps<typeof Sidebar> {
  chats?: UserChat[]
}

export function AppSidebar({ chats: initialChats, ...props }: AppSidebarProps) {
  const router = useRouter()
  const [isBotDialogOpen, setIsBotDialogOpen] = React.useState(false)
  const [isSearchOpen, setIsSearchOpen] = React.useState(false)
  const [fetchedChats, setFetchedChats] = React.useState<UserChat[] | null>(null)

  const chats = fetchedChats ?? initialChats ?? []

  React.useEffect(() => {
    if (initialChats === undefined) {
      getUserChats().then(setFetchedChats).catch(() => {})
    }
  }, [initialChats])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.key === "k" || event.key === "K") &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        setIsSearchOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const handleRefreshChats = React.useCallback(() => {
    getUserChats().then(setFetchedChats).catch(() => {})
  }, [])

  return (
    <Sidebar {...props}>
      <SidebarHeader className="flex flex-col gap-2">
        <div className="flex flex-row items-center justify-end group-data-[collapsible=icon]:justify-center">
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
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                onClick={() => setIsSearchOpen(true)}
                className={cn(
                  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
                  "hover:bg-muted hover:text-foreground dark:hover:bg-input/50",
                  "justify-between font-normal text-muted-foreground cursor-pointer shadow-none",
                  "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"
                )}
              />
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <Search className="size-4 shrink-0" />
              <span className="truncate group-data-[collapsible=icon]:hidden">
                Search
              </span>
            </div>
            <Kbd className="group-data-[collapsible=icon]:hidden">⌘K</Kbd>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            align="center"
            className="hidden group-data-[collapsible=icon]:flex items-center gap-1.5"
          >
            <span>Search</span>
            <Kbd>⌘K</Kbd>
          </TooltipContent>
        </Tooltip>
        <CommandDialog
          open={isSearchOpen}
          onOpenChange={setIsSearchOpen}
          title="Search chats"
          description="Search your conversations"
        >
          <Command className="rounded-none border-0 p-1">
            <CommandInput placeholder="Search chats..." />
            <CommandList>
              <CommandEmpty>No chats found.</CommandEmpty>
              <CommandGroup heading="Chats">
                {chats.map((chat) => {
                  const title = chat.name || chat.bot?.name || "Untitled"
                  const avatarSeed = chat.bot?.avatar || chat.bot?.name || chat.id
                  const timeAgo = chat.lastMessageAt
                    ? formatDistanceToNowStrict(new Date(chat.lastMessageAt))
                    : ""
                  const preview = chat.lastMessagePreview || ""

                  return (
                    <CommandItem
                      key={chat.id}
                      value={`${title} ${preview} ${chat.id}`}
                      onSelect={() => {
                        setIsSearchOpen(false)
                        router.push(`/chats/${chat.id}`)
                      }}
                      className="cursor-pointer gap-3 py-2"
                    >
                      <ChatAvatar
                        seed={avatarSeed}
                        alt={title}
                        className="size-8 shrink-0"
                      />
                      <div className="flex flex-1 flex-col min-w-0">
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="truncate font-medium text-sm">
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
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
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
                      render={<Link href={`/chats/${chat.id}`} />}
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
