
import { motion } from "framer-motion";
import { Spinner } from "@/components/ui/spinner";

export function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg ml-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Spinner variant="ring" className="text-excel" />
        <div className="flex flex-col">
          <p className="text-sm text-gray-700">Assistant is thinking...</p>
          <p className="text-xs text-gray-500">This may take a few seconds</p>
        </div>
      </div>
    </motion.div>
  );
}
