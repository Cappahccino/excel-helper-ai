
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState } from "./MessageLoadingState";
import { MessageMarkdown } from "./MessageMarkdown";

interface MessageContentProps {
  content: string;
  role: "user" | "assistant";
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  };
  isNewMessage?: boolean;
  isStreaming?: boolean;
  isProcessing?: boolean;
  streamingProgress?: number;
}

interface MessageState {
  tokens: string[];
  displayedContent: string;
  displayState: 'thinking' | 'streaming' | 'complete';
}

export function MessageContent({
  content,
  role,
  timestamp,
  fileInfo,
  isNewMessage = false,
  isStreaming = false,
  isProcessing = false,
  streamingProgress = 0,
}: MessageContentProps) {
  const [messageState, setMessageState] = useState<MessageState>({
    tokens: [],
    displayedContent: "",
    displayState: role === "assistant" ? "thinking" : "complete"
  });
  const contentRef = useRef(content);
  const streamingTimeoutRef = useRef<NodeJS.Timeout>();

  // Enhanced streaming effect with token-based updates
  useEffect(() => {
    if (role !== "assistant" || (!isStreaming && !isProcessing)) {
      setMessageState({
        tokens: [content],
        displayedContent: content,
        displayState: "complete"
      });
      return;
    }

    if (isProcessing) {
      setMessageState(prev => ({
        ...prev,
        displayState: "thinking"
      }));
      return;
    }

    // Reset state if content has completely changed
    if (content !== contentRef.current) {
      contentRef.current = content;
      
      // If new content includes previous content, only stream the new part
      if (content.startsWith(messageState.displayedContent)) {
        const newContent = content.slice(messageState.displayedContent.length);
        const newTokens = newContent.split(/(\s+)/).filter(Boolean);
        
        setMessageState(prev => ({
          ...prev,
          tokens: [...prev.tokens, ...newTokens],
          displayState: "streaming"
        }));
      } else {
        // Complete reset for new content
        setMessageState({
          tokens: content.split(/(\s+)/).filter(Boolean),
          displayedContent: "",
          displayState: "streaming"
        });
      }
    }

    // Progressive token display
    const displayNextToken = () => {
      setMessageState(prev => {
        const displayedTokensCount = prev.displayedContent.split(/(\s+)/).filter(Boolean).length;
        
        if (displayedTokensCount >= prev.tokens.length) {
          return {
            ...prev,
            displayState: isStreaming ? "streaming" : "complete"
          };
        }

        const nextToken = prev.tokens[displayedTokensCount];
        const newDisplayedContent = prev.displayedContent + nextToken;

        return {
          ...prev,
          displayedContent: newDisplayedContent,
          displayState: "streaming"
        };
      });

      // Schedule next token
      streamingTimeoutRef.current = setTimeout(displayNextToken, 
        Math.random() * (120 - 80) + 80 // Dynamic delay between 80-120ms
      );
    };

    // Start token display
    if (messageState.displayState === "streaming") {
      streamingTimeoutRef.current = setTimeout(displayNextToken, 50);
    }

    // Cleanup
    return () => {
      if (streamingTimeoutRef.current) {
        clearTimeout(streamingTimeoutRef.current);
      }
    };
  }, [content, role, isStreaming, isProcessing, messageState.displayedContent]);

  // Update display state when streaming ends
  useEffect(() => {
    if (!isStreaming && messageState.displayState === "streaming") {
      setMessageState(prev => ({
        ...prev,
        displayedContent: content,
        displayState: "complete"
      }));
    }
  }, [isStreaming, content]);

  const messageClassName = `p-5 rounded-xl flex group ${
    role === "assistant"
      ? "bg-gradient-to-br from-blue-50 to-blue-50/50 ml-4 items-start shadow-sm hover:shadow-md transition-shadow duration-200"
      : "bg-gradient-to-br from-gray-50 to-gray-50/50 mr-4 flex-row-reverse items-start shadow-sm hover:shadow-md transition-shadow duration-200"
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
      <MessageAvatar role={role} />
      <div
        className={`flex flex-col gap-2 ${
          role === "assistant" ? "ml-3" : "mr-3"
        } flex-1`}
      >
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {role === "assistant" ? (
            <div className="leading-relaxed [&>p]:mb-4 [&>p:last-child]:mb-0">
              <MessageMarkdown content={messageState.displayedContent} />
              <MessageLoadingState displayState={messageState.displayState} />
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800">
              {content}
            </p>
          )}
        </div>
        {fileInfo && (
          <div className="text-xs bg-gray-100 px-2 py-1 rounded-md inline-flex items-center gap-1 text-gray-600 w-fit">
            📎 {fileInfo.filename}
          </div>
        )}
        <MessageActions content={content} timestamp={timestamp} />
      </div>
    </motion.div>
  );
}
