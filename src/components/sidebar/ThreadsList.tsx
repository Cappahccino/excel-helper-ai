
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, ChevronDown, ChevronRight, FolderOpen, Folder } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar-new";

interface Thread {
  session_id: string;
  created_at: string;
  thread_id: string;
  excel_files: {
    id: string;
    filename: string;
  }[];
}

export function ThreadsList() {
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
        .order("updated_at", { ascending: false })
        .limit(5); // Limit to only show the 5 most recent chats

      if (sessionsError) throw sessionsError;
      return sessions;
    },
  });

  const handleThreadClick = (threadId: string) => {
    navigate(`/chat?thread=${threadId}`);
  };

  const toggleChatsExpanded = () => {
    setIsChatsExpanded(!isChatsExpanded);
  };

  return (
    <SidebarGroup>
      <motion.div
        animate={{ opacity: true ? 1 : 0 }}
        className="overflow-hidden"
      >
        <div 
          className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-200"
          onClick={toggleChatsExpanded}
        >
          <span className="flex items-center gap-2 text-xs font-medium text-gray-900">
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
            <span>Recent Chats</span>
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
                          className={`w-full justify-start gap-2 p-1.5 text-black hover:text-black hover:bg-gray-200 ${
                            currentThreadId === thread.session_id ? 'bg-gray-200' : ''
                          }`}
                        >
                          <MessageSquare className="h-3 w-3 shrink-0" />
                          <motion.div
                            animate={{ 
                              opacity: true ? 1 : 0,
                              width: true ? 'auto' : 0,
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
  );
}
