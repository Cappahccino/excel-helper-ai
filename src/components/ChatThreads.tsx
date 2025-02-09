
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { PlusCircle, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

interface Thread {
  session_id: string;
  created_at: string;
  thread_id: string;
  excel_files: {
    id: string;
    filename: string;
  }[];
}

interface ChatThreadsProps {
  threads: Thread[];
  isLoading: boolean;
  currentThreadId: string | null;
  onThreadClick: (threadId: string) => void;
  onNewThread: () => void;
}

export function ChatThreads({
  threads,
  isLoading,
  currentThreadId,
  onThreadClick,
  onNewThread,
}: ChatThreadsProps) {
  return (
    <div className="flex flex-col h-full">
      <Button 
        onClick={onNewThread}
        className="w-full flex items-center justify-start gap-2 text-black hover:text-black text-xs mb-4"
        variant="outline"
      >
        <PlusCircle className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">New Chat</span>
      </Button>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-1">
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
                <button
                  key={thread.session_id}
                  onClick={() => onThreadClick(thread.session_id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-md text-left hover:bg-gray-100 transition-colors ${
                    currentThreadId === thread.session_id ? 'bg-gray-100' : ''
                  }`}
                >
                  <MessageSquare className="h-3 w-3 shrink-0" />
                  <div className="flex flex-col items-start overflow-hidden">
                    <span className="text-xs font-medium truncate w-full">
                      {thread.excel_files?.[0]?.filename || 'Untitled Chat'}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {format(new Date(thread.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
