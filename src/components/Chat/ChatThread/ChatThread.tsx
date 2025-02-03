import { MessageList } from "../MessageList/MessageList";
import { MessageInput } from "../MessageInput/MessageInput";
import { Database } from "@/integrations/supabase/types";
import { ExcelPreview } from "@/components/ExcelPreview";
import { FileUploadZone } from "@/components/FileUploadZone";

type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];

interface ChatThreadProps {
  messages: ChatMessage[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  message: string;
  onMessageChange: (message: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isInputDisabled: boolean;
  uploadedFile: File | null;
  isUploading: boolean;
  uploadProgress: number;
  onFileUpload: (file: File) => Promise<void>;
  onResetUpload: () => void;
}

export function ChatThread({
  messages,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  message,
  onMessageChange,
  onSubmit,
  isInputDisabled,
  uploadedFile,
  isUploading,
  uploadProgress,
  onFileUpload,
  onResetUpload,
}: ChatThreadProps) {
  return (
    <div className="h-[600px] flex flex-col">
      <div className="flex-1 p-4 overflow-hidden">
        <FileUploadZone
          onFileUpload={onFileUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          currentFile={uploadedFile}
          onReset={onResetUpload}
        />

        {uploadedFile && !isUploading && (
          <div className="w-full">
            <ExcelPreview file={uploadedFile} />
          </div>
        )}

        <MessageList
          messages={messages}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={onLoadMore}
        />
      </div>

      <MessageInput
        message={message}
        onMessageChange={onMessageChange}
        onSubmit={onSubmit}
        disabled={isInputDisabled}
      />
    </div>
  );
}