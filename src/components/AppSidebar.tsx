
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
    icon: <Plus className="h-4 w-4 text-white" />,
  },
  {
    label: "My Chats",
    href: "/chat",
    icon: <MessageSquare className="h-4 w-4 text-white" />,
  },
  {
    label: "My Files",
    href: "/files",
    icon: <FileText className="h-4 w-4 text-white" />,
  },
  {
    label: "Documentation",
    href: "/docs",
    icon: <BookOpen className="h-4 w-4 text-white" />,
  },
  {
    label: "Upgrade Account",
    href: "/upgrade",
    icon: <ArrowUpRight className="h-4 w-4 text-white" />,
  },
  {
    label: "Account & Billing",
    href: "/account",
    icon: <CreditCard className="h-4 w-4 text-white" />,
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
      <SidebarBody className="justify-between gap-10 bg-gray-900">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          <motion.div 
            className="px-4 py-6"
            animate={{ opacity: open ? 1 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <h1 className="text-xl font-bold font-bricolage text-[#F2FCE2]">I hate excel</h1>
          </motion.div>
          <div className="flex flex-col gap-2">
            {links.map((link, idx) => (
              <SidebarLink key={idx} link={link} />
            ))}
          </div>
        </div>
        <div className="mt-auto">
          <SidebarLink
            link={{
              label: "Sign Out",
              href: "#",
              icon: <LogOut className="h-4 w-4 text-white" />,
            }}
            onClick={handleSignOut}
          />
        </div>
      </SidebarBody>
    </Sidebar>
  );
}
