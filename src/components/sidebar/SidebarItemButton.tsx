
import React from "react";
import { motion } from "framer-motion";
import { SidebarMenuButton } from "@/components/ui/sidebar-new";

interface SidebarItemButtonProps {
  onClick?: () => void;
  className?: string;
  isOpen?: boolean;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}

export const SidebarItemButton: React.FC<SidebarItemButtonProps> = ({
  onClick,
  className = "",
  isOpen = true,
  icon,
  label,
  isActive = false
}) => {
  const baseClassNames = `
    w-full flex items-center
    ${isOpen ? 'justify-start px-3' : 'justify-center'}
    py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100/80 
    transition-all rounded-md
    ${isActive ? 'bg-green-50 text-excel font-medium' : ''}
    ${className}
  `;

  return (
    <SidebarMenuButton
      onClick={onClick}
      className={baseClassNames}
    >
      <span className={`shrink-0 ${!isOpen ? 'w-8 flex justify-center' : ''}`}>
        {icon}
      </span>
      <motion.span
        animate={{ 
          opacity: isOpen ? 1 : 0,
          width: isOpen ? 'auto' : 0,
        }}
        className="overflow-hidden whitespace-nowrap text-sm ml-2"
      >
        {label}
      </motion.span>
    </SidebarMenuButton>
  );
};

export default SidebarItemButton;
