
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import {
  Sidebar,
  SidebarBody,
  SidebarContent,
  SidebarHeader,
} from "./ui/sidebar-new";
import { ThreadsList } from "./sidebar/ThreadsList";
import { NavigationMenu } from "./sidebar/NavigationMenu";
import { SidebarFooter } from "./sidebar/SidebarFooter";

export function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleNewThread = () => {
    navigate("/chat");
  };

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="flex flex-col h-full border-r z-50 bg-gradient-to-b from-white to-gray-50">
        <SidebarHeader className="border-b border-gray-200 p-4">
          <Button 
            onClick={handleNewThread}
            className={`
              w-full flex items-center justify-center
              text-excel hover:text-excel hover:bg-green-50/80 
              transition-colors text-sm min-h-[36px]
              ${open ? 'px-4 py-2' : 'p-2.5'}
            `}
            variant="outline"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <motion.span
              animate={{ opacity: open ? 1 : 0, width: open ? 'auto' : 0 }}
              className="overflow-hidden whitespace-nowrap font-medium ml-3"
            >
              New Chat
            </motion.span>
          </Button>
        </SidebarHeader>
        <SidebarContent className="flex-1 flex flex-col">
          <NavigationMenu isOpen={open} />
          <SidebarFooter />
        </SidebarContent>
      </SidebarBody>
    </Sidebar>
  );
}
