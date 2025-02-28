
import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CodeBlock } from "./CodeBlock";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink } from "lucide-react";
import { Button } from "../ui/button";

interface MessageMarkdownProps {
  content: string;
}

export function MessageMarkdown({ content }: MessageMarkdownProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

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
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          
          // Check if this is a code block with a language or just inline code
          // Safely check if 'inline' property exists and is true
          if (match && !(props as any).inline) {
            return (
              <CodeBlock
                language={match[1]}
                code={String(children).replace(/\n$/, "")}
              />
            );
          }
          
          // For inline code
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
            const isExpanded = expandedImage === fileId;
            
            return (
              <div className="image-container my-4">
                <img
                  src={src}
                  alt={alt || 'OpenAI generated image'}
                  onError={() => fileId && handleImageError(fileId)}
                  className="rounded-md shadow-md max-w-full"
                  style={{ 
                    maxHeight: isExpanded ? 'none' : '500px', 
                    objectFit: 'contain',
                    cursor: 'pointer'
                  }}
                  onClick={() => setExpandedImage(isExpanded ? null : fileId)}
                  {...props}
                />
                <div className="flex items-center mt-1 gap-2 text-xs text-gray-500">
                  <button 
                    onClick={() => setExpandedImage(isExpanded ? null : fileId)}
                    className="text-blue-500 hover:underline flex items-center gap-1"
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                  <span className="text-gray-300">|</span>
                  <a 
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Full Size <ExternalLink size={12} />
                  </a>
                  <span className="text-gray-300">|</span>
                  <a
                    href={src}
                    download={`ai-image-${fileId}.png`}
                    className="text-blue-500 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {alt && <span className="italic">"{alt}"</span>}
                </div>
              </div>
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
