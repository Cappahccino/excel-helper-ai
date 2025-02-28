
import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "./CodeBlock";
import { supabase } from "@/integrations/supabase/client";

interface MessageMarkdownProps {
  content: string;
}

export function MessageMarkdown({ content }: MessageMarkdownProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const processedContent = useMemo(() => {
    // Replace OpenAI image links with our edge function URLs
    return content.replace(
      /!\[([^\]]+)\]\(\/api\/images\/([a-zA-Z0-9-_]+)\)/g,
      (match, altText, fileId) => {
        // Replace with our edge function URL
        return `![${altText}](${window.location.origin}/api/fetch-openai-image/${fileId})`;
      }
    );
  }, [content]);

  const handleImageError = (fileId: string) => {
    setImageErrors(prev => ({ ...prev, [fileId]: true }));
  };

  return (
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          if (!inline && match) {
            return (
              <CodeBlock
                language={match[1]}
                value={String(children).replace(/\n$/, "")}
              />
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        img({ node, alt, src, ...props }) {
          // Extract the file ID from the URL
          const fileIdMatch = src?.match(/\/api\/fetch-openai-image\/([a-zA-Z0-9-_]+)/);
          const fileId = fileIdMatch ? fileIdMatch[1] : null;
          
          // Check if this image had an error loading
          const hasError = fileId ? imageErrors[fileId] : false;
          
          if (hasError) {
            return (
              <div className="flex flex-col items-center p-4 border border-gray-200 rounded-md bg-gray-50 my-2">
                <p className="text-gray-500 text-sm">
                  Unable to load OpenAI generated image
                </p>
                <button 
                  className="text-xs text-blue-500 mt-1 hover:underline"
                  onClick={() => {
                    if (fileId) {
                      setImageErrors(prev => ({ ...prev, [fileId]: false }));
                    }
                  }}
                >
                  Retry
                </button>
              </div>
            );
          }
          
          if (fileId) {
            // Add authorization headers if this is an OpenAI image
            return (
              <img
                src={src}
                alt={alt || 'OpenAI generated image'}
                onError={() => fileId && handleImageError(fileId)}
                className="rounded-md shadow-md max-w-full my-4"
                style={{ maxHeight: '500px', objectFit: 'contain' }}
                {...props}
              />
            );
          }
          
          // Regular image
          return <img src={src} alt={alt || ''} {...props} />;
        }
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
