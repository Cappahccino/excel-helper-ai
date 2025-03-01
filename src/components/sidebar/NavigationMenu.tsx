
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
        <div className={`${isOpen ? 'px-4' : 'px-2'} py-3`}>
          <span className={`
            flex items-center text-sm font-semibold text-gray-900
            ${isOpen ? '' : 'justify-center'}
          `}>
            <Database className="h-4 w-4 shrink-0" />
            <motion.span
              animate={{ 
                opacity: isOpen ? 1 : 0,
                width: isOpen ? 'auto' : 0,
              }}
              className="overflow-hidden whitespace-nowrap ml-2"
            >
              Workspace
            </motion.span>
          </span>
        </div>
        <Separator className="mb-2 opacity-50" />
        
        <ThreadsList isOpen={isOpen} />

        <SidebarMenu className="space-y-1">
          {workspaceNavLinks.map((link) => (
            <SidebarMenuItem key={link.label} className="px-2">
              <SidebarMenuButton
                onClick={() => handleNavigation(link.href)}
                className={`
                  w-full flex items-center
                  ${isOpen ? 'justify-start px-3' : 'justify-center'}
                  py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 
                  transition-all rounded-md
                  ${location.pathname === link.href ? 'bg-green-50 text-excel font-medium w-full' : ''}
                `}
              >
                <span className={`shrink-0 ${!isOpen ? 'w-8 flex justify-center' : ''}`}>
                  {link.icon}
                </span>
                <motion.span
                  animate={{ 
                    opacity: isOpen ? 1 : 0,
                    width: isOpen ? 'auto' : 0,
                  }}
                  className="overflow-hidden whitespace-nowrap text-sm ml-2"
                >
                  {link.label}
                </motion.span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className="mt-6">
        <div className={`${isOpen ? 'px-4' : 'px-2'} py-3`}>
          <span className={`
            flex items-center text-sm font-semibold text-gray-900
            ${isOpen ? '' : 'justify-center'}
          `}>
            <Glasses className="h-4 w-4 shrink-0" />
            <motion.span
              animate={{ 
                opacity: isOpen ? 1 : 0,
                width: isOpen ? 'auto' : 0,
              }}
              className="overflow-hidden whitespace-nowrap ml-2"
            >
              Resources
            </motion.span>
          </span>
        </div>
        <Separator className="mb-2 opacity-50" />
        
        <SidebarMenu className="space-y-1">
          {resourceNavLinks.map((link) => (
            <SidebarMenuItem key={link.label} className="px-2">
              <SidebarMenuButton
                onClick={() => handleNavigation(link.href)}
                className={`
                  w-full flex items-center
                  ${isOpen ? 'justify-start px-3' : 'justify-center'}
                  py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 
                  transition-all rounded-md
                  ${location.pathname === link.href ? 'bg-green-50 text-excel font-medium w-full' : ''}
                `}
              >
                <span className={`shrink-0 ${!isOpen ? 'w-8 flex justify-center' : ''}`}>
                  {link.icon}
                </span>
                <motion.span
                  animate={{ 
                    opacity: isOpen ? 1 : 0,
                    width: isOpen ? 'auto' : 0,
                  }}
                  className="overflow-hidden whitespace-nowrap text-sm ml-2"
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
