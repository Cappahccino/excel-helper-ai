import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";

interface ChatThreadProps {
  threadId: string;
  fileId: string | null;
}

export function ChatThread({ threadId, fileId }: ChatThreadProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList threadId={threadId} />
      </div>
      <MessageInput threadId={threadId} fileId={fileId} />
    </div>
  );
}