
import { Spinner } from "../ui/spinner";
import { motion } from "framer-motion";

interface MessageLoadingStateProps {
  displayState: 'thinking' | 'streaming' | 'complete';
}

export function MessageLoadingState({ displayState }: MessageLoadingStateProps) {
  if (displayState === "thinking") {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 mt-2"
      >
        <Spinner variant="ring" className="h-4 w-4 text-excel" />
        <span className="text-sm text-gray-500">Assistant is thinking...</span>
      </motion.div>
    );
  }
  if (displayState === "streaming") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="inline-flex"
      >
        <span className="inline-block h-4 w-[2px] bg-excel animate-blink ml-1" />
      </motion.div>
    );
  }
  return null;
}
