"use client"

import * as React from "react"
import { UserButton } from "@clerk/nextjs"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup />
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
