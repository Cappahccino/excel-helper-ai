
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { 
  PlusCircle, 
  MessageSquare, 
  ChevronDown, 
  ChevronRight, 
  FolderOpen, 
  Folder,
  Files,
  BookOpen,
  ArrowUpRight,
  CreditCard,
  LogOut
} from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sidebar,
  SidebarBody,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "./ui/sidebar-new";

interface Thread {
  session_id: string;
  created_at: string;
  thread_id: string;
  excel_files: {
    id: string;
    filename: string;
  }[];
}

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
    label: "Upgrade Account",
    href: "/upgrade",
    icon: <ArrowUpRight className="h-4 w-4 text-white" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-4 w-4 text-white" />,
  },
];

export function ChatSidebar() {
  const [open, setOpen] = useState(false);
  const [isChatsExpanded, setIsChatsExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentThreadId = searchParams.get("thread");

  const { data: threads, isLoading } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: sessions, error: sessionsError } = await supabase
        .from("chat_sessions")
        .select(`
          session_id,
          created_at,
          thread_id,
          excel_files (
            id,
            filename
          )
        `)
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (sessionsError) throw sessionsError;
      return sessions;
    },
  });

  const handleThreadClick = (threadId: string) => {
    navigate(`/chat?thread=${threadId}`);
  };

  const handleNewThread = () => {
    navigate("/chat");
  };

  const toggleChatsExpanded = () => {
    setIsChatsExpanded(!isChatsExpanded);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleNavigation = (href: string) => {
    navigate(href);
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
          <SidebarGroup>
            <motion.div
              animate={{ opacity: open ? 1 : 0 }}
              className="overflow-hidden"
            >
              <div 
                className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-200"
                onClick={toggleChatsExpanded}
              >
                <span className="flex items-center gap-2 text-black text-xs">
                  {isChatsExpanded ? (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      <FolderOpen className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      <Folder className="h-3 w-3" />
                    </>
                  )}
                  <span className="font-medium">My Chats</span>
                </span>
              </div>
            </motion.div>
            <AnimatePresence>
              {isChatsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ScrollArea className="h-[280px]">
                    <SidebarGroupContent className="pl-8">
                      <SidebarMenu className="space-y-0.5">
                        {isLoading ? (
                          <div className="flex items-center justify-center p-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
                          </div>
                        ) : threads?.length === 0 ? (
                          <div className="text-xs text-gray-600 p-4 text-center">
                            No chats yet
                          </div>
                        ) : (
                          threads?.map((thread) => (
                            <SidebarMenuItem key={thread.session_id}>
                              <SidebarMenuButton
                                onClick={() => handleThreadClick(thread.session_id)}
                                className={`w-full justify-start gap-2 p-1.5 text-black hover:text-black ${
                                  currentThreadId === thread.session_id ? 'bg-gray-200' : ''
                                }`}
                              >
                                <MessageSquare className="h-3 w-3 shrink-0" />
                                <motion.div
                                  animate={{ 
                                    opacity: open ? 1 : 0,
                                    width: open ? 'auto' : 0,
                                  }}
                                  className="flex flex-col items-start overflow-hidden"
                                >
                                  <span className="text-xs font-medium truncate">
                                    {thread.excel_files?.[0]?.filename || 'Untitled Chat'}
                                  </span>
                                  <span className="text-[10px] text-gray-600">
                                    {format(new Date(thread.created_at), 'MMM d, yyyy')}
                                  </span>
                                </motion.div>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))
                        )}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </ScrollArea>
                </motion.div>
              )}
            </AnimatePresence>
          </SidebarGroup>

          {/* Main Navigation */}
          <SidebarGroup className="mt-4">
            <SidebarMenu className="px-2 space-y-1">
              {mainNavLinks.map((link) => (
                <SidebarMenuItem key={link.label}>
                  <SidebarMenuButton
                    onClick={() => handleNavigation(link.href)}
                    className={`w-full justify-start gap-2 p-2 text-black hover:text-black ${
                      location.pathname === link.href ? 'bg-gray-200' : ''
                    }`}
                  >
                    {React.cloneElement(link.icon, { className: 'h-4 w-4 text-gray-700' })}
                    <motion.span
                      animate={{ 
                        opacity: open ? 1 : 0,
                        width: open ? 'auto' : 0,
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

          {/* Sign Out Button */}
          <div className="mt-auto p-2">
            <SidebarMenuButton
              onClick={handleSignOut}
              className="w-full justify-start gap-2 p-2 text-black hover:text-black"
            >
              <LogOut className="h-4 w-4 text-gray-700" />
              <motion.span
                animate={{ 
                  opacity: open ? 1 : 0,
                  width: open ? 'auto' : 0,
                }}
                className="text-xs font-medium truncate"
              >
                Sign Out
              </motion.span>
            </SidebarMenuButton>
          </div>
        </SidebarContent>
      </SidebarBody>
    </Sidebar>
  );
}
