
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
        className="mt-2"
      >
        <Spinner variant="ring" className="h-4 w-4 text-blue-600" />
      </motion.div>
    );
  }

  return null;
}
