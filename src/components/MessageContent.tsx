
import { Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  };
}

export function MessageContent({ content, role, timestamp, fileInfo }: MessageContentProps) {
  const { toast } = useToast();
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      toast({
        description: "Message copied to clipboard",
      });
    });
  };

  const getInitials = () => {
    return role === 'assistant' ? 'AI' : 'U';
  };

  const messageClassName = `p-5 rounded-xl flex group ${
    role === 'assistant'
      ? 'bg-gradient-to-br from-blue-50 to-blue-50/50 ml-4 items-start shadow-sm hover:shadow-md transition-shadow duration-200'
      : 'bg-gradient-to-br from-gray-50 to-gray-50/50 mr-4 flex-row-reverse items-start shadow-sm hover:shadow-md transition-shadow duration-200'
  }`;

  return (
    <motion.div 
      className={messageClassName}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      layout
    >
      <Avatar className="h-8 w-8 shrink-0 shadow-sm">
        <AvatarFallback className={role === 'assistant' ? 'bg-excel text-white' : 'bg-gray-600 text-white'}>
          {getInitials()}
        </AvatarFallback>
      </Avatar>
      <div className={`flex flex-col gap-2 ${role === 'assistant' ? 'ml-3' : 'mr-3'} flex-1`}>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
        {fileInfo && (
          <div className="text-xs bg-gray-100 px-2 py-1 rounded-md inline-flex items-center gap-1 text-gray-600 w-fit">
            📎 {fileInfo.filename}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">{timestamp}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={copyToClipboard}
            title="Copy message"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
