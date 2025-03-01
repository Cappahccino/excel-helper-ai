import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, FileText, MessageCircle, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface TabFile {
  name: string;
  size: string;
  type: string;
  id?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

interface TabData {
  title: string;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyState?: string;
  fetchData?: () => Promise<TabFile[]>;
}

// Define tab content with all required data
const TAB_DEFINITIONS: TabData[] = [
  {
    title: "Recent",
    key: "recent",
    icon: Clock,
    emptyState: "No recent activity",
    fetchData: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data } = await supabase
        .from("chat_sessions")
        .select(`
          session_id,
          excel_files:excel_file_id (
            id,
            filename,
            file_size
          ),
          updated_at
        `)
        .order('updated_at', { ascending: false })
        .limit(5);
        
      return (data || []).map(session => ({
        name: session.excel_files?.filename || "Conversation",
        size: session.excel_files ? formatFileSize(session.excel_files.file_size) : "",
        type: session.excel_files ? "Excel" : "Chat",
        id: session.session_id,
        icon: session.excel_files ? <FileText className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />
      }));
    }
  },
  {
    title: "Files",
    key: "files",
    icon: FileText,
    emptyState: "No files found",
    fetchData: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data } = await supabase
        .from("excel_files")
        .select("*")
        .is("deleted_at", null)
        .order('created_at', { ascending: false })
        .limit(5);
        
      return (data || []).map(file => ({
        name: file.filename,
        size: formatFileSize(file.file_size),
        type: "Excel",
        id: file.id,
        icon: <FileText className="w-4 h-4" />
      }));
    }
  },
  {
    title: "Conversations",
    key: "conversations",
    icon: MessageCircle,
    emptyState: "No conversations yet",
    fetchData: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data } = await supabase
        .from("chat_messages")
        .select(`
          id,
          content,
          created_at,
          session_id
        `)
        .eq("role", "user")
        .is("deleted_at", null)
        .order('created_at', { ascending: false })
        .limit(5);
        
      return (data || []).map(message => ({
        name: message.content.substring(0, 50) + (message.content.length > 50 ? "..." : ""),
        size: "",
        type: "Message",
        id: message.session_id,
        icon: <MessageCircle className="w-4 h-4" />
      }));
    }
  }
];

// Helper function to format file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const TabContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("recent");
  const navigate = useNavigate();
  
  // Get active tab definition
  const activeTabDef = useMemo(() => 
    TAB_DEFINITIONS.find(tab => tab.key === activeTab), 
    [activeTab]
  );
  
  // Fetch data for the active tab
  const { data: tabItems = [], isLoading } = useQuery({
    queryKey: ['tab-content', activeTab],
    queryFn: () => activeTabDef?.fetchData?.() || Promise.resolve([]),
    enabled: !!activeTabDef?.fetchData,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
  
  // Handle item clicks
  const handleItemClick = useCallback((item: TabFile) => {
    if (!item.id) return;
    
    if (activeTab === 'files') {
      navigate(`/chat?fileId=${item.id}`);
    } else {
      navigate(`/chat?sessionId=${item.id}`);
    }
  }, [activeTab, navigate]);
  
  return (
    <div className="w-full max-w-7xl mx-auto px-4 lg:px-6 pb-6">
      <div className="relative w-full min-h-[400px] flex justify-center p-6 font-sans md:text-base text-xs sm:text-sm rounded-2xl shadow-lg px-0 py-0 my-0 mx-[5px] bg-zinc-50/80 backdrop-blur-sm border border-gray-100/50">
        <div className="w-11/12 md:w-4/5 relative mt-16">
          <div className="absolute inset-0" style={{
            filter: "url(#goo-filter)"
          }}>
            {/* Tab Headers */}
            <div className="flex w-full" role="tablist" aria-label="Content Categories">
              {TAB_DEFINITIONS.map((tab, index) => (
                <div key={tab.key} className="relative flex-1 h-8 md:h-10" role="tab">
                  <button
                    onClick={() => setActiveTab(tab.key)}
                    aria-selected={activeTab === tab.key}
                    aria-controls={`tabpanel-${tab.key}`}
                    className="w-full h-full focus:outline-none focus:ring-2 focus:ring-excel focus:ring-offset-2 rounded-t-lg"
                  >
                    <span className="sr-only">{tab.title}</span>
                  </button>
                  {activeTab === tab.key && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute inset-0 bg-[#efefef]"
                      transition={{
                        type: "spring",
                        bounce: 0.0,
                        duration: 0.4
                      }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Tab Content */}
            <div className="w-full h-[150px] sm:h-[200px] md:h-[250px] bg-[#efefef] overflow-hidden text-muted-foreground">
              <AnimatePresence mode="wait">
                {TAB_DEFINITIONS.map((tab) => (
                  <div 
                    key={tab.key}
                    role="tabpanel"
                    id={`tabpanel-${tab.key}`}
                    aria-labelledby={`tab-${tab.key}`}
                    hidden={activeTab !== tab.key}
                  >
                    {activeTab === tab.key && (
                      <motion.div
                        initial={{ opacity: 0, y: 50, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -50, filter: "blur(10px)" }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="p-6 md:p-8 h-full"
                      >
                        <div className="space-y-4 mt-2 sm:mt-4 md:mt-4">
                          {isLoading ? (
                            <div className="flex items-center justify-center h-24">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-excel"></div>
                            </div>
                          ) : tabItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-24 text-gray-500">
                              <tab.icon className="w-8 h-8 mb-2 opacity-50" />
                              <p>{tab.emptyState || "No items found"}</p>
                            </div>
                          ) : (
                            <ul className="space-y-3">
                              {tabItems.map((item, index) => (
                                <li
                                  key={`${item.name}-${index}`}
                                  className="border-b border-muted-foreground/20 pt-2 pb-1 text-black cursor-pointer hover:bg-white/50 px-2 rounded transition-colors"
                                  onClick={() => handleItemClick(item)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 truncate">
                                      {item.icon}
                                      <span className="truncate">{item.name}</span>
                                    </div>
                                    {item.size && (
                                      <span className="text-xs text-muted-foreground ml-2">
                                        {item.size}
                                      </span>
                                    )}
                                  </div>
                                </li>
                              ))}
                              <li className="pt-2">
                                <a 
                                  href={activeTab === 'files' ? '/files' : '/chat'} 
                                  className="flex items-center gap-1 text-excel hover:underline"
                                >
                                  <span>View all {tab.title.toLowerCase()}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </li>
                            </ul>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Tab Buttons */}
          <div className="relative flex w-full" aria-hidden="true">
            {TAB_DEFINITIONS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex-1 h-8 md:h-10"
                id={`tab-${tab.key}`}
              >
                <span className={`
                  w-full h-full flex items-center justify-center gap-2
                  ${activeTab === tab.key ? "text-black" : "text-muted-foreground"}
                  transition-colors
                `}>
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.title}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Filter for Gooey Effect */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="goo-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
    </div>
  );
};

export default TabContent;
