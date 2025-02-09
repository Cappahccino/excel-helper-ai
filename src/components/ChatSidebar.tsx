
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { PlusCircle } from "lucide-react";
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
      <SidebarBody className="flex flex-col bg-gray-100 h-full">
        <SidebarHeader className="border-b p-4">
          <Button 
            onClick={handleNewThread}
            className="w-full flex items-center justify-start gap-2 text-black hover:text-black text-xs"
            variant="outline"
          >
            <PlusCircle className={`h-4 w-4 shrink-0 ${!open && 'mx-auto'}`} />
            <motion.span
              animate={{ opacity: open ? 1 : 0, width: open ? 'auto' : 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              New Chat
            </motion.span>
          </Button>
        </SidebarHeader>
        <SidebarContent className="flex-1 flex flex-col">
          <ThreadsList />
          <NavigationMenu />
          <SidebarFooter />
        </SidebarContent>
      </SidebarBody>
    </Sidebar>
  );
}
