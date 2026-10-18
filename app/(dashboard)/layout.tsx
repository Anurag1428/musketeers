import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { getUserChats } from "@/queries/bot"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const chats = await getUserChats().catch(() => [])

  return (
    <SidebarProvider>
      <AppSidebar chats={chats} />
      {children}
    </SidebarProvider>
  )
}

