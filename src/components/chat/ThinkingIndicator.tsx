
import { motion } from "framer-motion";

export function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg ml-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-excel"></div>
        <div className="flex flex-col">
          <p className="text-sm text-gray-700">Assistant is thinking...</p>
          <p className="text-xs text-gray-500">This may take a few seconds</p>
        </div>
      </div>
    </motion.div>
  );
}
