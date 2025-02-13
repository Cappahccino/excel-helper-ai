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
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar-new";

interface Thread {
  id: string;
  title: string;
  created_at: string;
}

const fetchThreads = async () => {
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching threads:", error);
    return [];
  }
  return data as Thread[];
};

export function ThreadsList() {
  const [isChatsExpanded, setIsChatsExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentThreadId = searchParams.get("thread");

  const { data: threads, isLoading, isError } = useQuery({
    queryKey: ['threads'],
    queryFn: fetchThreads,
  });

  const handleThreadClick = (threadId: string) => {
    navigate(`/chat?thread=${threadId}`);
  };

  const toggleChatsExpanded = () => {
    setIsChatsExpanded(!isChatsExpanded);
  };

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
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <MessagesSquare className="h-4 w-4" />
            <motion.span
              animate={{ 
                opacity: true ? 1 : 0,
                width: true ? 'auto' : 0,
                marginLeft: true ? '0.75rem' : 0,
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
                {threads?.map((thread) => (
                  <SidebarMenuItem key={thread.id}>
                    <SidebarMenuButton
                      onClick={() => handleThreadClick(thread.id)}
                      className={`w-full justify-start gap-3 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 transition-all ${
                        currentThreadId === thread.id ? 'bg-green-50 text-excel font-medium' : ''
                      }`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      <motion.span
                        animate={{ 
                          opacity: true ? 1 : 0,
                          width: true ? 'auto' : 0,
                          marginLeft: true ? '0.75rem' : 0,
                        }}
                        className="overflow-hidden whitespace-nowrap text-sm"
                      >
                        {thread.title || format(new Date(thread.created_at), 'MMM d, yyyy')}
                      </motion.span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </SidebarGroupContent>
  );
}
