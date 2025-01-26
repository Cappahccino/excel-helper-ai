import {
  MessageSquare,
  List,
  File,
  BookOpen,
  ArrowUpRight,
  CreditCard,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const sidebarItems = [
  {
    title: "New Chat",
    icon: MessageSquare,
  },
  {
    title: "My Chats",
    icon: List,
  },
  {
    title: "My Files",
    icon: File,
  },
  {
    title: "Documentation",
    icon: BookOpen,
  },
  {
    title: "Upgrade Account",
    icon: ArrowUpRight,
  },
  {
    title: "Account & Billing",
    icon: CreditCard,
  },
];

export function AppSidebar() {
  return (
    <Sidebar defaultOpen>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {sidebarItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton>
                    <item.icon className="h-5 w-5" />
                    <span>{item.title}</span>
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