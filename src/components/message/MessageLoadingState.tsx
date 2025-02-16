
import { Spinner } from "../ui/spinner";
import { motion } from "framer-motion";

interface MessageLoadingStateProps {
  displayState: 'thinking' | 'streaming' | 'complete';
}

export function MessageLoadingState({ displayState }: MessageLoadingStateProps) {
  if (displayState === "thinking" || displayState === "streaming") {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 mt-2 bg-blue-50/50 p-2 rounded-lg w-fit"
      >
        <Spinner variant="ring" className="h-4 w-4 text-blue-600" />
        <span className="text-sm text-gray-600">Processing...</span>
      </motion.div>
    );
  }

  return null;
}
