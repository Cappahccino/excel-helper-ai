import { Message } from "@/types/chat";
import { MessageContent } from "./message/MessageContent";
import { formatDistance } from "date-fns";

interface OptimisticMessageProps {
  message: string;
  fileInfo?: {
    filename: string;
    file_size: number;
  } | null;
}

export function OptimisticMessage({ message, fileInfo }: OptimisticMessageProps) {
  const timestamp = formatDistance(new Date(), new Date(), { addSuffix: true });

  const optimisticMessage: Message = {
    id: 'optimistic-' + Date.now(),
    content: message,
    role: 'user',
    session_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'completed',
    is_ai_response: false,
    message_files: fileInfo ? [{
      file_id: 'temp',
      role: 'user',
      filename: fileInfo.filename,
      file_size: fileInfo.file_size
    }] : undefined,
    version: '1.0.0',
    metadata: null
  };

  return (
    <MessageContent
      messageId={optimisticMessage.id}
      content={optimisticMessage.content}
      role={optimisticMessage.role}
      timestamp={timestamp}
      fileInfo={fileInfo}
      status="completed"
      metadata={null}
    />
  );
}
