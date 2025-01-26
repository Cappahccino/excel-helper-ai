import {
  MessageSquare,
  FileText,
  BookOpen,
  ArrowUpRight,
  CreditCard,
  Plus,
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

  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody className="justify-between gap-10 bg-gray-900">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mt-8 flex flex-col gap-2">
            {links.map((link, idx) => (
              <SidebarLink key={idx} link={link} />
            ))}
          </div>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}