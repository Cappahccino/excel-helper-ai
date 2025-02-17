
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar-new";

interface Thread {
  session_id: string;
  created_at: string;
  thread_id: string | null;
  excel_files: {
    id: string;
    filename: string;
  }[];
  parent_session_id: string | null;
  thread_level: number;
  thread_position: number;
  thread_metadata: {
    title: string | null;
    summary: string | null;
  } | null;
  child_threads?: Thread[];
}

export function ThreadsList() {
  const [isChatsExpanded, setIsChatsExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentSessionId = searchParams.get("sessionId");

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
          ),
          parent_session_id,
          thread_level,
          thread_position,
          thread_metadata
        `)
        .eq("user_id", user.id)
        .is("parent_session_id", null)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (sessionsError) throw sessionsError;

      // Fetch child threads for each session
      const sessionsWithThreads = await Promise.all(
        sessions.map(async (session) => {
          const { data: childThreads, error: childThreadsError } = await supabase
            .from("chat_sessions")
            .select(`
              session_id,
              created_at,
              thread_id,
              excel_files (
                id,
                filename
              ),
              parent_session_id,
              thread_level,
              thread_position,
              thread_metadata
            `)
            .eq("parent_session_id", session.session_id)
            .order("thread_position", { ascending: true });

          if (childThreadsError) throw childThreadsError;

          return {
            ...session,
            child_threads: childThreads || [],
          };
        })
      );

      return sessionsWithThreads;
    },
  });

  const handleThreadClick = (sessionId: string) => {
    navigate(`/chat?sessionId=${sessionId}`);
  };

  const toggleChatsExpanded = () => {
    setIsChatsExpanded(!isChatsExpanded);
  };

  const ThreadItem = ({ thread, level = 0 }: { thread: Thread; level?: number }) => (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => handleThreadClick(thread.session_id)}
          className={`w-full justify-start gap-3 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 transition-all ${
            currentSessionId === thread.session_id ? 'bg-green-50 text-excel' : ''
          }`}
          style={{ paddingLeft: `${(level + 1) * 1}rem` }}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <motion.div
            animate={{ 
              opacity: true ? 1 : 0,
              width: true ? 'auto' : 0,
            }}
            className="flex flex-col items-start overflow-hidden"
          >
            <span className="text-sm font-medium truncate">
              {thread.thread_metadata?.title || 
               thread.excel_files?.[0]?.filename || 
               'Untitled Chat'}
            </span>
            <span className="text-xs text-gray-500">
              {format(new Date(thread.created_at), 'MMM d, yyyy')}
            </span>
          </motion.div>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {thread.child_threads?.map((childThread) => (
        <ThreadItem
          key={childThread.session_id}
          thread={childThread}
          level={level + 1}
        />
      ))}
    </>
  );

  return (
    <SidebarGroupContent>
      <motion.div
        animate={{ opacity: 1 }}
        className="overflow-hidden"
      >
        <div 
          className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100/80 transition-colors"
          onClick={toggleChatsExpanded}
        >
          <span className="flex items-center gap-3 text-sm font-semibold text-gray-900">
            {isChatsExpanded ? (
              <>
                <ChevronDown className="h-4 w-4" />
                <MessagesSquare className="h-4 w-4" />
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                <MessagesSquare className="h-4 w-4" />
              </>
            )}
            <motion.span
              animate={{ 
                opacity: true ? 1 : 0,
                width: true ? 'auto' : 0,
              }}
              className="overflow-hidden whitespace-nowrap"
            >
              Recent Chats
            </motion.span>
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
            <ScrollArea className="h-[200px]">
              <SidebarMenu className="space-y-1 pl-8">
                {isLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-excel"></div>
                  </div>
                ) : threads?.length === 0 ? (
                  <div className="text-sm text-gray-600 p-4 text-center">
                    No chats yet
                  </div>
                ) : (
                  threads?.map((thread) => (
                    <ThreadItem key={thread.session_id} thread={thread} />
                  ))
                )}
              </SidebarMenu>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarGroupContent>
  );
}
