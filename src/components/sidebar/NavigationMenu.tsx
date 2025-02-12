
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  Files,
  BookOpen,
  ArrowUpRight,
  CreditCard,
  FilePlus,
  FolderIcon,
  Database,
} from "lucide-react";
import { motion } from "framer-motion";
import { ThreadsList } from "./ThreadsList";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar-new";
import { Separator } from "@/components/ui/separator";

const workspaceNavLinks = [
  {
    label: "My Workflows",
    href: "/workflows",
    icon: <FolderIcon className="h-3 w-3 text-gray-700" />,
  },
  {
    label: "Create Workflow",
    href: "/canvas",
    icon: <FilePlus className="h-3 w-3 text-gray-700" />,
  },
  {
    label: "My Files",
    href: "/files",
    icon: <Files className="h-3 w-3 text-gray-700" />,
  },
];

const resourceNavLinks = [
  {
    label: "Documentation",
    href: "/docs",
    icon: <BookOpen className="h-3 w-3 text-gray-700" />,
  },
  {
    label: "Pricing",
    href: "/pricing",
    icon: <ArrowUpRight className="h-3 w-3 text-gray-700" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-3 w-3 text-gray-700" />,
  },
];

export function NavigationMenu() {
  const location = useLocation();
  const navigate = useNavigate();
  const { open } = useSidebar();

  const handleNavigation = (href: string) => {
    navigate(href);
  };

  return (
    <>
      <SidebarGroup>
        <div className="px-4 py-2">
          <span className="flex items-center gap-2 text-xs font-medium text-gray-900">
            <Database className="h-3 w-3" />
            <motion.span
              animate={{ 
                opacity: open ? 1 : 0,
                width: open ? 'auto' : 0,
                display: open ? 'inline' : 'none'
              }}
            >
              Workspace
            </motion.span>
          </span>
        </div>

        {/* Recent Chats */}
        <ThreadsList />

        {/* Workspace Navigation */}
        <SidebarMenu className="px-2 space-y-1">
          {workspaceNavLinks.map((link) => (
            <SidebarMenuItem key={link.label}>
              <SidebarMenuButton
                onClick={() => handleNavigation(link.href)}
                className={`w-full justify-start gap-2 p-1.5 text-black hover:text-black hover:bg-gray-200 ${
                  location.pathname === link.href ? 'bg-gray-200' : ''
                }`}
              >
                {link.icon}
                <motion.span
                  animate={{ 
                    opacity: open ? 1 : 0,
                    width: open ? 'auto' : 0,
                    display: open ? 'inline' : 'none'
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

      <Separator className="my-4 bg-gray-200" />

      <SidebarGroup>
        <div className="px-4 py-2">
          <span className="flex items-center gap-2 text-xs font-medium text-gray-900">
            <BookOpen className="h-3 w-3" />
            <motion.span
              animate={{ 
                opacity: open ? 1 : 0,
                width: open ? 'auto' : 0,
                display: open ? 'inline' : 'none'
              }}
            >
              Resources
            </motion.span>
          </span>
        </div>
        <SidebarMenu className="px-2 space-y-1">
          {resourceNavLinks.map((link) => (
            <SidebarMenuItem key={link.label}>
              <SidebarMenuButton
                onClick={() => handleNavigation(link.href)}
                className={`w-full justify-start gap-2 p-1.5 text-black hover:text-black hover:bg-gray-200 ${
                  location.pathname === link.href ? 'bg-gray-200' : ''
                }`}
              >
                {link.icon}
                <motion.span
                  animate={{ 
                    opacity: open ? 1 : 0,
                    width: open ? 'auto' : 0,
                    display: open ? 'inline' : 'none'
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
    </>
  );
}
