
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import { PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar, SidebarBody, SidebarContent, SidebarHeader } from "./ui/sidebar-new";
import { Tree, Folder, File } from "./ui/file-tree";

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

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="flex flex-col bg-[#f3f3f3]">
        <SidebarHeader className="border-b border-gray-200 p-4">
          <Button 
            onClick={handleNewThread}
            className="w-full flex items-center justify-center gap-2 bg-white text-black hover:bg-gray-100"
            variant="outline"
          >
            <PlusCircle className="h-4 w-4 text-black" />
            <motion.span
              animate={{ opacity: open ? 1 : 0, width: open ? 'auto' : 0 }}
              className="overflow-hidden whitespace-nowrap text-black"
            >
              New Chat
            </motion.span>
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="h-[calc(100vh-6rem)]"
            >
              <Tree>
                <Folder element="My Chats" value="chats" defaultOpen>
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
                      <File
                        key={thread.session_id}
                        value={thread.session_id}
                        isSelect={currentThreadId === thread.session_id}
                        onClick={() => handleThreadClick(thread.session_id)}
                        className="cursor-pointer"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {thread.excel_files?.[0]?.filename || 'Untitled Chat'}
                          </span>
                          <span className="text-xs text-gray-600">
                            {format(new Date(thread.created_at), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </File>
                    ))
                  )}
                </Folder>
              </Tree>
            </motion.div>
          </AnimatePresence>
        </SidebarContent>
      </SidebarBody>
    </Sidebar>
  );
}
