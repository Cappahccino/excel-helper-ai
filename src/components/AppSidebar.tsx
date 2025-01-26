import {
  MessageSquare,
  FileText,
  BookOpen,
  CreditCard,
  User,
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
  SidebarProvider,
} from "@/components/ui/sidebar";

const items = [
  {
    title: "New Chat",
    icon: MessageSquare,
  },
  {
    title: "My Chats",
    icon: MessageSquare,
  },
  {
    title: "My Files",
    icon: FileText,
  },
  {
    title: "Documentation",
    icon: BookOpen,
  },
  {
    title: "Upgrade Account",
    icon: CreditCard,
  },
  {
    title: "Account & Billing",
    icon: User,
  },
];

export function AppSidebar() {
  return (
    <SidebarProvider>
      <Sidebar className="border-r border-gray-800">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menu</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton>
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}