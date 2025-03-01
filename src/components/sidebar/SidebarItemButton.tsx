// 1. Common Sidebar Button Component (new file: src/components/sidebar/SidebarItemButton.tsx)
import React from "react";
import { motion } from "framer-motion";
import { SidebarMenuButton } from "@/components/ui/sidebar-new";

interface SidebarItemButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  isOpen?: boolean;
  onClick: () => void;
  className?: string;
  level?: number;
  secondaryText?: string;
}

export const SidebarItemButton: React.FC<SidebarItemButtonProps> = ({
  icon,
  label,
  isActive = false,
  isOpen = true,
  onClick,
  className = "",
  level = 0,
  secondaryText,
}) => {
  const paddingLeft = level ? `${(level + 1) * 1}rem` : undefined;

  return (
    <SidebarMenuButton
      onClick={onClick}
      className={`
        w-full flex items-center
        ${isOpen ? "justify-start px-3" : "justify-center"}
        py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 
        transition-all rounded-md
        ${isActive ? "bg-green-50 text-excel font-medium" : ""}
        ${className}
      `}
      style={{ paddingLeft }}
    >
      <span className={`shrink-0 ${!isOpen ? "w-8 flex justify-center" : ""}`}>
        {icon}
      </span>
      <motion.div
        animate={{
          opacity: isOpen ? 1 : 0,
          width: isOpen ? "auto" : 0,
        }}
        className="overflow-hidden whitespace-nowrap ml-2"
      >
        <div className="flex flex-col items-start">
          <span className="text-sm font-medium truncate">{label}</span>
          {secondaryText && (
            <span className="text-xs text-gray-500">{secondaryText}</span>
          )}
        </div>
      </motion.div>
    </SidebarMenuButton>
  );
};

// 2. Modified ThreadItem.tsx
import React from "react";
import { MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { SidebarMenuItem } from "@/components/ui/sidebar-new";
import { Thread } from "./types/thread";
import { SidebarItemButton } from "./SidebarItemButton";

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
  isOpen = true,
}) => (
  <>
    <SidebarMenuItem>
      <SidebarItemButton
        icon={<MessageSquare className="h-4 w-4 shrink-0" />}
        label={
          thread.thread_metadata?.title ||
          thread.excel_files?.[0]?.filename ||
          "Untitled Chat"
        }
        secondaryText={format(new Date(thread.created_at), "MMM d, yyyy")}
        isActive={currentSessionId === thread.session_id}
        isOpen={isOpen}
        onClick={() => onThreadClick(thread.session_id)}
        level={level}
      />
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

// 3. Modified NavigationMenu.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Files,
  Glasses,
  ArrowUpRight,
  CreditCard,
  FilePlus,
  Bolt,
  Database,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar-new";
import { Separator } from "@/components/ui/separator";
import { ThreadsList } from "./ThreadsList";
import { SidebarItemButton } from "./SidebarItemButton";

type NavLink = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

const workspaceNavLinks: NavLink[] = [
  {
    label: "My Workflows",
    href: "/workflows",
    icon: <Bolt className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "Create Workflow",
    href: "/canvas",
    icon: <FilePlus className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "My Files",
    href: "/files",
    icon: <Files className="h-4 w-4 text-gray-600" />,
  },
];

const resourceNavLinks: NavLink[] = [
  {
    label: "Documentation",
    href: "/docs",
    icon: <MessageSquare className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "Pricing",
    href: "/pricing",
    icon: <ArrowUpRight className="h-4 w-4 text-gray-600" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-4 w-4 text-gray-600" />,
  },
];

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  isOpen: boolean;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, isOpen }) => (
  <div className={`${isOpen ? "px-4" : "px-2"} py-3`}>
    <span
      className={`
        flex items-center text-sm font-semibold text-gray-900
        ${isOpen ? "" : "justify-center"}
      `}
    >
      {icon}
      <motion.span
        animate={{
          opacity: isOpen ? 1 : 0,
          width: isOpen ? "auto" : 0,
        }}
        className="overflow-hidden whitespace-nowrap ml-2"
      >
        {title}
      </motion.span>
    </span>
  </div>
);

interface NavigationMenuProps {
  isOpen: boolean;
}

export function NavigationMenu({ isOpen }: NavigationMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavigation = (href: string) => {
    navigate(href);
  };

  const renderNavLinks = (links: NavLink[]) => (
    <SidebarMenu className="space-y-1">
      {links.map((link) => (
        <SidebarMenuItem key={link.label} className="px-2">
          <SidebarItemButton
            icon={link.icon}
            label={link.label}
            isActive={location.pathname === link.href}
            isOpen={isOpen}
            onClick={() => handleNavigation(link.href)}
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <>
      <SidebarGroup>
        <SectionHeader
          icon={<Database className="h-4 w-4 shrink-0" />}
          title="Workspace"
          isOpen={isOpen}
        />
        <Separator className="mb-2 opacity-50" />

        <ThreadsList isOpen={isOpen} />
        {renderNavLinks(workspaceNavLinks)}
      </SidebarGroup>

      <SidebarGroup className="mt-6">
        <SectionHeader
          icon={<Glasses className="h-4 w-4 shrink-0" />}
          title="Resources"
          isOpen={isOpen}
        />
        <Separator className="mb-2 opacity-50" />
        {renderNavLinks(resourceNavLinks)}
      </SidebarGroup>
    </>
  );
}

// 4. Modified ThreadsList.tsx
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

interface ThreadsListProps {
  isOpen?: boolean;
}

export function ThreadsList({ isOpen = true }: ThreadsListProps) {
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
        isOpen={isOpen}
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
                      isOpen={isOpen}
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

// 5. Modified ThreadsHeader.tsx
import React from "react";
import { ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";
import { motion } from "framer-motion";

interface ThreadsHeaderProps {
  isExpanded: boolean;
  onToggle: () => void;
  isOpen?: boolean;
}

export const ThreadsHeader: React.FC<ThreadsHeaderProps> = ({
  isExpanded,
  onToggle,
  isOpen = true,
}) => (
  <motion.div animate={{ opacity: 1 }} className="overflow-hidden">
    <div
      className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100/80 transition-colors"
      onClick={onToggle}
    >
      <span className={`flex items-center gap-3 text-sm font-semibold text-gray-900 ${!isOpen && 'justify-center w-full'}`}>
        {isExpanded ? (
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
            opacity: isOpen ? 1 : 0,
            width: isOpen ? "auto" : 0,
          }}
          className="overflow-hidden whitespace-nowrap"
        >
          Recent Chats
        </motion.span>
      </span>
    </div>
  </motion.div>
);

// 6. Modified SidebarFooter.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { SidebarItemButton } from "./SidebarItemButton";

interface SidebarFooterProps {
  isOpen?: boolean;
}

export function SidebarFooter({ isOpen = true }: SidebarFooterProps) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="mt-auto p-3 border-t border-gray-200">
      <SidebarItemButton
        icon={<LogOut className="h-4 w-4" />}
        label="Sign Out"
        isOpen={isOpen}
        onClick={handleSignOut}
        className="w-full justify-start gap-3 p-2 text-gray-700 hover:text-red-600 hover:bg-red-50/80 transition-all"
      />
    </div>
  );
}
