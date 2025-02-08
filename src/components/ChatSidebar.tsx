
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { PlusCircle, MessageSquare, ChevronDown, ChevronRight, FolderOpen, Folder } from "lucide-react";
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

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="flex flex-col bg-gray-900">
        <SidebarHeader className="border-b p-4">
          <Button 
            onClick={handleNewThread}
            className="w-full flex items-center justify-center gap-2"
            variant="outline"
          >
            <PlusCircle className="h-4 w-4" />
            <motion.span
              animate={{ opacity: open ? 1 : 0, width: open ? 'auto' : 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              New Chat
            </motion.span>
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <motion.div
              animate={{ opacity: open ? 1 : 0 }}
              className="overflow-hidden"
            >
              <div 
                className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-800"
                onClick={toggleChatsExpanded}
              >
                <span className="flex items-center gap-2 text-white">
                  {isChatsExpanded ? (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      <FolderOpen className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4" />
                      <Folder className="h-4 w-4" />
                    </>
                  )}
                  <span className="text-sm font-medium">My Chats</span>
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
                  <ScrollArea className="h-[calc(100vh-10rem)]">
                    <SidebarGroupContent className="pl-8">
                      <SidebarMenu>
                        {isLoading ? (
                          <div className="flex items-center justify-center p-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
                          </div>
                        ) : threads?.length === 0 ? (
                          <div className="text-sm text-muted-foreground p-4 text-center">
                            No chats yet
                          </div>
                        ) : (
                          threads?.map((thread) => (
                            <SidebarMenuItem key={thread.session_id}>
                              <SidebarMenuButton
                                onClick={() => handleThreadClick(thread.session_id)}
                                className={`w-full justify-start gap-2 ${
                                  currentThreadId === thread.session_id ? 'bg-accent' : ''
                                }`}
                              >
                                <MessageSquare className="h-4 w-4 text-white shrink-0" />
                                <motion.div
                                  animate={{ 
                                    opacity: open ? 1 : 0,
                                    width: open ? 'auto' : 0,
                                  }}
                                  className="flex flex-col items-start overflow-hidden"
                                >
                                  <span className="text-sm font-medium text-white truncate">
                                    {thread.excel_files?.[0]?.filename || 'Untitled Chat'}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
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
        </SidebarContent>
      </SidebarBody>
    </Sidebar>
  );
}
