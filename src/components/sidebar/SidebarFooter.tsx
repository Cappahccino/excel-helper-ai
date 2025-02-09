
import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { SidebarMenuButton } from "@/components/ui/sidebar-new";
import { supabase } from "@/integrations/supabase/client";

export function SidebarFooter() {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <div className="mt-auto p-2">
      <SidebarMenuButton
        onClick={handleSignOut}
        className="w-full justify-start gap-2 p-2 text-black hover:text-black"
      >
        <LogOut className="h-4 w-4 text-gray-700" />
        <motion.span
          animate={{ 
            opacity: true ? 1 : 0,
            width: true ? 'auto' : 0,
          }}
          className="text-xs font-medium truncate"
        >
          Sign Out
        </motion.span>
      </SidebarMenuButton>
    </div>
  );
}
