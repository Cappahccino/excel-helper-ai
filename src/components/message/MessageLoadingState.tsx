
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
        className="flex items-center gap-2 mt-2 bg-blue-50/50 p-3 rounded-lg"
      >
        <Spinner variant="ring" className="h-4 w-4 text-blue-600" />
        <div className="flex flex-col">
          <span className="text-sm text-gray-700">Assistant is thinking...</span>
          <span className="text-xs text-gray-500">This might take a few seconds</span>
        </div>
      </motion.div>
    );
  }

  if (displayState === "streaming") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="inline-flex items-center gap-2 mt-2"
      >
        <span className="inline-block h-4 w-[2px] bg-green-500 animate-blink" />
        <span className="text-xs text-gray-500">Assistant is typing...</span>
      </motion.div>
    );
  }

  return null;
}
