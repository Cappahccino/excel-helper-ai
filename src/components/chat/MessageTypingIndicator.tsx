import { motion } from "framer-motion";

export function MessageTypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 max-w-max ml-12"
    >
      <span className="sr-only">Assistant is typing</span>
      <div className="flex space-x-1">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-gray-400"
            initial={{ y: 0 }}
            animate={{ y: [0, -5, 0] }}
            transition={{
              duration: 0.5,
              repeat: Infinity,
              repeatType: "loop",
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
