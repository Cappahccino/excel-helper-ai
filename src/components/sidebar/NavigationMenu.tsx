
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  MessageSquare, 
  Files,
  BookOpen,
  ArrowUpRight,
  CreditCard,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar-new";

const mainNavLinks = [
  {
    label: "Past Chats",
    href: "/chat",
    icon: <MessageSquare className="h-4 w-4 text-white" />,
  },
  {
    label: "My Files",
    href: "/files",
    icon: <Files className="h-4 w-4 text-white" />,
  },
  {
    label: "Documentation",
    href: "/docs",
    icon: <BookOpen className="h-4 w-4 text-white" />,
  },
  {
    label: "Pricing",
    href: "/pricing",
    icon: <ArrowUpRight className="h-4 w-4 text-white" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-4 w-4 text-white" />,
  },
];

export function NavigationMenu() {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigation = (href: string) => {
    navigate(href);
  };

  return (
    <SidebarGroup className="mt-4">
      <SidebarMenu className="px-2 space-y-1">
        {mainNavLinks.map((link) => (
          <SidebarMenuItem key={link.label}>
            <SidebarMenuButton
              onClick={() => handleNavigation(link.href)}
              className={`w-full justify-start gap-2 p-2 text-black hover:text-black hover:bg-gray-200 ${
                location.pathname === link.href ? 'bg-gray-200' : ''
              }`}
            >
              {React.cloneElement(link.icon, { className: 'h-4 w-4 text-gray-700' })}
              <motion.span
                animate={{ 
                  opacity: true ? 1 : 0,
                  width: true ? 'auto' : 0,
                }}
                className="text-xs font-medium truncate"
              >
                {link.label}
              </motion.span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
