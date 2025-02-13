
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  MessageSquare, 
  Files,
  Glasses,
  ArrowUpRight,
  CreditCard,
  FilePlus,
  Bolt,
  Database,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar-new";
import { Separator } from "@/components/ui/separator";
import { ThreadsList } from "./ThreadsList";

const workspaceNavLinks = [
  {
    label: "My Workflows",
    href: "/workflows",
    icon: <Bolt className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "Create Workflow",
    href: "/canvas",
    icon: <FilePlus className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "My Files",
    href: "/files",
    icon: <Files className="h-4 w-4 text-gray-600" />,
  },
];

const resourceNavLinks = [
  {
    label: "Documentation",
    href: "/docs",
    icon: <MessageSquare className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "Pricing",
    href: "/pricing",
    icon: <ArrowUpRight className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-4 w-4 text-gray-600" />,
  },
];

interface NavigationMenuProps {
  isOpen: boolean;
}

export function NavigationMenu({ isOpen }: NavigationMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigation = (href: string) => {
    navigate(href);
  };

  return (
    <>
      <SidebarGroup>
        <div className="px-4 py-3">
          <span className="flex items-center gap-3 text-sm font-semibold text-gray-900">
            <Database className="h-4 w-4" />
            <motion.span
              animate={{ 
                opacity: isOpen ? 1 : 0,
                width: isOpen ? 'auto' : 0,
              }}
              className="overflow-hidden whitespace-nowrap"
            >
              Workspace
            </motion.span>
          </span>
        </div>
        <Separator className="mb-2 opacity-50" />
        
        <ThreadsList />

        <SidebarMenu className="px-2 space-y-1">
          {workspaceNavLinks.map((link) => (
            <SidebarMenuItem key={link.label}>
              <SidebarMenuButton
                onClick={() => handleNavigation(link.href)}
                className={`w-full justify-start gap-3 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 transition-all ${
                  location.pathname === link.href ? 'bg-green-50 text-excel font-medium' : ''
                }`}
              >
                {link.icon}
                <motion.span
                  animate={{ 
                    opacity: isOpen ? 1 : 0,
                    width: isOpen ? 'auto' : 0,
                    marginLeft: isOpen ? '0.75rem' : 0,
                  }}
                  className="overflow-hidden whitespace-nowrap text-sm"
                >
                  {link.label}
                </motion.span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className="mt-6">
        <div className="px-4 py-3">
          <span className="flex items-center gap-3 text-sm font-semibold text-gray-900">
            <Glasses className="h-4 w-4" />
            <motion.span
              animate={{ 
                opacity: isOpen ? 1 : 0,
                width: isOpen ? 'auto' : 0,
              }}
              className="overflow-hidden whitespace-nowrap"
            >
              Resources
            </motion.span>
          </span>
        </div>
        <Separator className="mb-2 opacity-50" />
        
        <SidebarMenu className="px-2 space-y-1">
          {resourceNavLinks.map((link) => (
            <SidebarMenuItem key={link.label}>
              <SidebarMenuButton
                onClick={() => handleNavigation(link.href)}
                className={`w-full justify-start gap-3 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 transition-all ${
                  location.pathname === link.href ? 'bg-green-50 text-excel font-medium' : ''
                }`}
              >
                {link.icon}
                <motion.span
                  animate={{ 
                    opacity: isOpen ? 1 : 0,
                    width: isOpen ? 'auto' : 0,
                    marginLeft: isOpen ? '0.75rem' : 0,
                  }}
                  className="overflow-hidden whitespace-nowrap text-sm"
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
