import { MessageSquare, List, File, BookOpen, ArrowUpRight, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

const sidebarItems = [
  {
    title: "New Chat",
    icon: MessageSquare,
    href: "/chat",
  },
  {
    title: "My Chats",
    icon: List,
    href: "/chat",
  },
  {
    title: "My Files",
    icon: File,
    href: "/chat",
  },
  {
    title: "Documentation",
    icon: BookOpen,
    href: "#",
  },
  {
    title: "Upgrade Account",
    icon: ArrowUpRight,
    href: "#",
  },
  {
    title: "Account & Billing",
    icon: Settings,
    href: "#",
  },
];

export function AppSidebar() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Menu</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sidebarItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <a
                          href={item.href}
                          className="w-full flex items-center gap-2"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </div>
    </SidebarProvider>
  );
}