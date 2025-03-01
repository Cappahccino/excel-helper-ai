
import React from "react";
import { MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { SidebarMenuItem, SidebarMenuButton } from "@/components/ui/sidebar-new";
import { Thread } from "./types/thread";

interface ThreadItemProps {
  thread: Thread;
  level?: number;
  currentSessionId: string | null;
  onThreadClick: (sessionId: string) => void;
  isOpen?: boolean;
}

export const ThreadItem: React.FC<ThreadItemProps> = ({ 
  thread, 
  level = 0, 
  currentSessionId,
  onThreadClick,
  isOpen = true
}) => (
  <>
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => onThreadClick(thread.session_id)}
        className={`w-full justify-start gap-3 p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 transition-all ${
          currentSessionId === thread.session_id ? 'bg-green-50 text-excel' : ''
        }`}
        style={{ paddingLeft: `${(level + 1) * 1}rem` }}
      >
        <MessageSquare className="h-4 w-4 shrink-0" />
        <motion.div
          animate={{ 
            opacity: isOpen ? 1 : 0,
            width: isOpen ? 'auto' : 0,
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
        currentSessionId={currentSessionId}
        onThreadClick={onThreadClick}
        isOpen={isOpen}
      />
    ))}
  </>
);
