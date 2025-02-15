
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

export function MessageContent({
  content,
  role,
  timestamp,
  fileInfo,
  isNewMessage = false,
  isStreaming = false,
}: MessageContentProps) {
  const { toast } = useToast();
  const [displayedText, setDisplayedText] = useState("");
  const contentRef = useRef(content);
  const typeIndexRef = useRef(0);
  const typingSpeedRef = useRef(20); // Typing speed in milliseconds

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

  // Enhanced typing effect
  useEffect(() => {
    if (role !== "assistant" || !isStreaming) {
      setDisplayedText(content);
      return;
    }

    // Reset if content has completely changed
    if (content !== contentRef.current) {
      contentRef.current = content;
      if (content.startsWith(displayedText)) {
        // If new content includes current display, continue from current position
        typeIndexRef.current = displayedText.length;
      } else {
        // Complete reset if content doesn't match
        typeIndexRef.current = 0;
        setDisplayedText("");
      }
    }

    const typeNextCharacter = () => {
      if (typeIndexRef.current < content.length) {
        setDisplayedText(content.slice(0, typeIndexRef.current + 1));
        typeIndexRef.current += 1;

        // Adjust typing speed based on content
        const nextChar = content[typeIndexRef.current];
        if (nextChar === '.' || nextChar === '!' || nextChar === '?') {
          typingSpeedRef.current = 50; // Slower at sentence ends
        } else if (nextChar === ',' || nextChar === ';') {
          typingSpeedRef.current = 35; // Slightly slower at commas
        } else {
          typingSpeedRef.current = 20; // Normal speed
        }
      }
    };

    const typingTimeout = setTimeout(typeNextCharacter, typingSpeedRef.current);
    return () => clearTimeout(typingTimeout);
  }, [content, role, isStreaming, displayedText]);

  // Reset typing when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      setDisplayedText(content);
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
                {displayedText}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-flex items-center gap-2 mt-2">
                  <Spinner variant="ring" className="h-4 w-4 text-excel" />
                  <span className="text-sm text-gray-500">Thinking...</span>
                </span>
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
