
import ReactMarkdown from "react-markdown";
import { InlineMath, BlockMath } from "react-katex";
import { CodeBlock } from "./CodeBlock";
import "katex/dist/katex.min.css";

interface MessageMarkdownProps {
  content: string;
}

export function MessageMarkdown({ content }: MessageMarkdownProps) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-semibold mb-4 mt-6">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mb-3 mt-5">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mb-2 mt-4">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-6 mb-4 space-y-2">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-gray-800">{children}</li>
        ),
        code: ({ inline, className, children }) => {
          const match = /language-(\w+)/.exec(className || '');
          const language = match ? match[1] : 'typescript';
          
          if (inline) {
            return (
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-gray-800">
                {children}
              </code>
            );
          }

          return (
            <CodeBlock
              code={String(children).replace(/\n$/, '')}
              language={language}
              className="my-4"
            />
          );
        },
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
      {content}
    </ReactMarkdown>
  );
}
