
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import { SidebarGroupContent, SidebarMenu } from "@/components/ui/sidebar-new";
import { ThreadItem } from "./ThreadItem";
import { ThreadsHeader } from "./ThreadsHeader";
import { transformThreadMetadata } from "./utils/threadUtils";
import type { Thread } from "./types/thread";

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
          excel_files:excel_file_id (
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

      const transformedSessions = sessions.map(session => ({
        ...session,
        excel_files: session.excel_files ? [session.excel_files] : [],
        thread_metadata: transformThreadMetadata(session.thread_metadata)
      }));

      const sessionsWithThreads = await Promise.all(
        transformedSessions.map(async (session) => {
          const { data: childThreads, error: childThreadsError } = await supabase
            .from("chat_sessions")
            .select(`
              session_id,
              created_at,
              thread_id,
              excel_files:excel_file_id (
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

          const transformedChildThreads = childThreads?.map(thread => ({
            ...thread,
            excel_files: thread.excel_files ? [thread.excel_files] : [],
            thread_metadata: transformThreadMetadata(thread.thread_metadata)
          })) || [];

          return {
            ...session,
            child_threads: transformedChildThreads,
          };
        })
      );

      return sessionsWithThreads;
    },
  });

  const handleThreadClick = (sessionId: string) => {
    navigate(`/chat?sessionId=${sessionId}`);
  };

  return (
    <SidebarGroupContent>
      <ThreadsHeader 
        isExpanded={isChatsExpanded} 
        onToggle={() => setIsChatsExpanded(!isChatsExpanded)} 
      />
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
                    <ThreadItem 
                      key={thread.session_id} 
                      thread={thread}
                      currentSessionId={currentSessionId}
                      onThreadClick={handleThreadClick}
                    />
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
