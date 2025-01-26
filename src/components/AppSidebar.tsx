import {
  MessageSquare,
  FileText,
  BookOpen,
  ArrowUpRight,
  CreditCard,
  Plus,
  LogOut,
} from "lucide-react";
import { Sidebar, SidebarBody, SidebarLink } from "@/components/ui/sidebar-new";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const links = [
  {
    label: "New Chat",
    href: "/chat",
    icon: <Plus className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />,
  },
  {
    label: "My Chats",
    href: "/chat",
    icon: <MessageSquare className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />,
  },
  {
    label: "My Files",
    href: "/files",
    icon: <FileText className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />,
  },
  {
    label: "Documentation",
    href: "/docs",
    icon: <BookOpen className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />,
  },
  {
    label: "Upgrade Account",
    href: "/upgrade",
    icon: <ArrowUpRight className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />,
  },
];

export function AppSidebar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-10 bg-[#1A1F2C]">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mt-8 flex flex-col gap-2">
            {links.map((link, idx) => (
              <SidebarLink key={idx} link={link} />
            ))}
          </div>
        </div>
        <div className="mt-auto mb-4">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
          >
            <LogOut className="h-4 w-4 text-neutral-700 dark:text-neutral-200" />
            <motion.span
              animate={{
                display: open ? "inline-block" : "none",
                opacity: open ? 1 : 0,
              }}
            >
              Sign Out
            </motion.span>
          </button>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}