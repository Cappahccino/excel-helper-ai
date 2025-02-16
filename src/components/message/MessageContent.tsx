
import { MessageMarkdown } from "./MessageMarkdown";
import { MessageAvatar } from "./MessageAvatar";
import { MessageActions } from "./MessageActions";
import { MessageLoadingState } from "./MessageLoadingState";
import { FileInfo } from "../FileInfo";

interface MessageContentProps {
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
  isNewMessage?: boolean;
  isStreaming?: boolean;
  isProcessing?: boolean;
}

export function MessageContent({ 
  content, 
  role, 
  timestamp,
  fileInfo,
  isNewMessage,
  isStreaming,
  isProcessing
}: MessageContentProps) {
  let displayState: 'thinking' | 'streaming' | 'complete' = 'complete';

  if (isProcessing) {
    displayState = 'thinking';
  } else if (isStreaming) {
    displayState = 'streaming';
  }

  return (
    <div className={`group relative flex gap-3 ${role === 'assistant' ? 'items-start' : 'items-center'}`}>
      <MessageAvatar role={role} />
      <div className="flex-1">
        {role === 'user' && fileInfo && (
          <FileInfo
            filename={fileInfo.filename}
            fileSize={fileInfo.file_size}
            className="mb-2"
          />
        )}
        <div className="prose prose-slate max-w-none">
          <MessageMarkdown content={content} />
        </div>
        <MessageActions content={content} timestamp={timestamp} />
        {role === 'assistant' && isNewMessage && (
          <MessageLoadingState displayState={displayState} />
        )}
      </div>
    </div>
  );
}
