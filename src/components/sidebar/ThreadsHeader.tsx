
import React from "react";
import { ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";
import { motion } from "framer-motion";

interface ThreadsHeaderProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export const ThreadsHeader: React.FC<ThreadsHeaderProps> = ({ isExpanded, onToggle }) => (
  <motion.div
    animate={{ opacity: 1 }}
    className="overflow-hidden"
  >
    <div 
      className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100/80 transition-colors"
      onClick={onToggle}
    >
      <span className="flex items-center gap-3 text-sm font-semibold text-gray-900">
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
            opacity: true ? 1 : 0,
            width: true ? 'auto' : 0,
          }}
          className="overflow-hidden whitespace-nowrap"
        >
          Recent Chats
        </motion.span>
      </span>
    </div>
  </motion.div>
);
