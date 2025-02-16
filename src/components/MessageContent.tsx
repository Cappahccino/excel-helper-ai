
import { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import "katex/dist/katex.min.css";
import { InlineMath, BlockMath } from "react-katex";
import { Spinner } from "./ui/spinner";

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
}: MessageContentProps) {
  const { toast } = useToast();
  const [messageState, setMessageState] = useState<MessageState>({
    tokens: [],
    displayedContent: "",
    displayState: role === "assistant" ? "thinking" : "complete"
  });
  const contentRef = useRef(content);
  const streamingTimeoutRef = useRef<NodeJS.Timeout>();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      toast({
        description: "Message copied to clipboard",
      });
    });
  };

  const getInitials = () => {
    return role === "assistant" ? "AI" : "U";
  };

  // Enhanced streaming effect with token-based updates
  useEffect(() => {
    if (role !== "assistant" || !isStreaming) {
      setMessageState({
        tokens: [content],
        displayedContent: content,
        displayState: "complete"
      });
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
  }, [content, role, isStreaming, messageState.displayedContent]);

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
      <Avatar className="h-8 w-8 shrink-0 shadow-sm">
        <AvatarFallback
          className={
            role === "assistant" ? "bg-excel text-white" : "bg-gray-600 text-white"
          }
        >
          {getInitials()}
        </AvatarFallback>
      </Avatar>
      <div
        className={`flex flex-col gap-2 ${
          role === "assistant" ? "ml-3" : "mr-3"
        } flex-1`}
      >
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {role === "assistant" ? (
            <div className="leading-relaxed [&>p]:mb-4 [&>p:last-child]:mb-0">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-semibold mb-4 mt-6">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold mb-3 mt-5">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-semibold mb-2 mt-4">
                      {children}
                    </h3>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-6 mb-4 space-y-2">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="text-sm text-gray-800">{children}</li>
                  ),
                  code: ({ children }) => (
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4">
                      {children}
                    </pre>
                  ),
                  p: ({ children }) => {
                    if (typeof children === "string") {
                      const parts = children.split(/(INLINEMATH{.*?}|BLOCKMATH{.*?})/g);
                      return (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                          {parts.map((part, index) => {
                            if (part.startsWith("INLINEMATH{")) {
                              const latex = part.slice(11, -1);
                              return (
                                <span key={index}>
                                  <InlineMath math={latex} />
                                </span>
                              );
                            } else if (part.startsWith("BLOCKMATH{")) {
                              const latex = part.slice(10, -1);
                              return (
                                <div key={index}>
                                  <BlockMath math={latex} />
                                </div>
                              );
                            }
                            return part;
                          })}
                        </p>
                      );
                    }
                    return (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">
                        {children}
                      </p>
                    );
                  },
                }}
              >
                {messageState.displayedContent}
              </ReactMarkdown>
              {messageState.displayState === "thinking" ? (
                <span className="inline-flex items-center gap-2 mt-2">
                  <Spinner variant="ring" className="h-4 w-4 text-excel" />
                  <span className="text-sm text-gray-500">Thinking...</span>
                </span>
              ) : messageState.displayState === "streaming" && (
                <span className="inline-block h-4 w-[2px] bg-excel animate-blink ml-1" />
              )}
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
