
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { PlusCircle, MessageSquare, Menu, X } from "lucide-react";
import { format } from "date-fns";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "./ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

interface Thread {
  session_id: string;
  created_at: string;
  file_id?: string;
  filename?: string;
}

export function ChatSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentThreadId = searchParams.get("thread");

  const { data: threads, isLoading } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("chat_sessions")
        .select(`
          session_id,
          created_at,
          excel_files (
            id,
            filename
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Thread[];
    },
  });

  const handleThreadClick = (threadId: string) => {
    navigate(`/chat?thread=${threadId}`);
  };

  const handleNewThread = () => {
    navigate("/chat");
  };

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={(open) => setIsCollapsed(!open)}
      className="relative"
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-4 top-4 z-50 rounded-full border shadow-md bg-background"
        >
          {isCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent forceMount className="w-64">
        <Sidebar className="border-r">
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
                            <MessageSquare className="h-4 w-4" />
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-medium">
                                {thread.filename || 'Untitled Chat'}
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
        </Sidebar>
      </CollapsibleContent>
    </Collapsible>
  );
}
