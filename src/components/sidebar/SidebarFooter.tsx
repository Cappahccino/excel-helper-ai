
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
    <div className="mt-auto p-3 border-t border-gray-200">
      <SidebarMenuButton
        onClick={handleSignOut}
        className="w-full justify-start gap-3 p-2 text-gray-700 hover:text-red-600 hover:bg-red-50/80 transition-all"
      >
        <LogOut className="h-4 w-4" />
        <motion.span
          animate={{ 
            opacity: true ? 1 : 0,
            width: true ? 'auto' : 0,
          }}
          className="text-sm font-medium truncate"
        >
          Sign Out
        </motion.span>
      </SidebarMenuButton>
    </div>
  );
}
