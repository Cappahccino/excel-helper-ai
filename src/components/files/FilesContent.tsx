
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilesList } from '@/components/FilesList';
import { FileActions } from '@/components/files/FileActions';
import { ExcelFile } from '@/types/files';

interface FilesContentProps {
  files: ExcelFile[];
  isLoading: boolean;
  searchQuery: string;
  selectedFiles: string[];
  onSearch: (query: string) => void;
  onSelectionChange: (files: string[]) => void;
  onBulkDownload: () => Promise<void>;
  onBulkDelete: () => Promise<void>;
}

export function FilesContent({
  files,
  isLoading,
  searchQuery,
  selectedFiles,
  onSearch,
  onSelectionChange,
  onBulkDownload,
  onBulkDelete,
}: FilesContentProps) {
  return (
    <div className="flex-grow flex flex-col overflow-hidden bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <FileActions 
          onSearch={onSearch}
          searchQuery={searchQuery}
          selectedCount={selectedFiles.length}
          onBulkDownload={onBulkDownload}
          onBulkDelete={onBulkDelete}
        />
      </div>
      
      <ScrollArea className="flex-grow p-4">
        <FilesList 
          files={files}
          isLoading={isLoading}
          selectedFiles={selectedFiles}
          onSelectionChange={onSelectionChange}
        />
      </ScrollArea>
    </div>
  );
}
