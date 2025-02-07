
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { PlusCircle, MessageSquare } from "lucide-react";
import { format } from "date-fns";
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

interface ChatSidebarProps {
  onNewChat?: () => void;
}

export function ChatSidebar({ onNewChat }: ChatSidebarProps) {
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

      // Get all chat sessions for the user
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
    onNewChat?.();
  };

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="flex flex-col bg-gray-900">
        <SidebarHeader className="border-b p-4">
          <Button 
            onClick={handleNewThread}
            className="w-full flex items-center gap-2"
            variant="outline"
          >
            <PlusCircle className="h-4 w-4" />
            New Chat
          </Button>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Recent Chats</SidebarGroupLabel>
            <ScrollArea className="h-[calc(100vh-10rem)]">
              <SidebarGroupContent>
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
                          <MessageSquare className="h-4 w-4 text-white" />
                          <div className="flex flex-col items-start">
                            <span className="text-sm font-medium text-white">
                              {thread.excel_files?.[0]?.filename || 'Untitled Chat'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(thread.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </ScrollArea>
          </SidebarGroup>
        </SidebarContent>
      </SidebarBody>
    </Sidebar>
  );
}
