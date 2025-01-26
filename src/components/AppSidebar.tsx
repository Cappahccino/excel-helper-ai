import {
  MessageSquare,
  FileText,
  BookOpen,
  ArrowUpRight,
  CreditCard,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  {
    title: "New Chat",
    icon: MessageSquare,
    url: "/chat",
  },
  {
    title: "My Chats",
    icon: MessageSquare,
    url: "/chat",
  },
  {
    title: "My Files",
    icon: FileText,
    url: "/files",
  },
  {
    title: "Documentation",
    icon: BookOpen,
    url: "/docs",
  },
  {
    title: "Upgrade Account",
    icon: ArrowUpRight,
    url: "/upgrade",
  },
  {
    title: "Account & Billing",
    icon: CreditCard,
    url: "/account",
  },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <a href={item.url}>
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
  );
}