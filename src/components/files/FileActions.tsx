
import { Download, MessageSquare, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FileActionsProps {
  onSearch: (query: string) => void;
  searchQuery: string;
  selectedCount?: number;
  onBulkDownload?: () => void;
  onBulkDelete?: () => void;
  onBulkChat?: () => void;
}

export function FileActions({ 
  onSearch, 
  searchQuery, 
  selectedCount = 0,
  onBulkDownload,
  onBulkDelete,
  onBulkChat
}: FileActionsProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6 justify-between items-center">
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
        <Input
          placeholder="Search files..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkChat}
          disabled={selectedCount === 0}
          className="text-gray-600 hover:text-gray-900"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Chat {selectedCount > 0 && `(${selectedCount})`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkDownload}
          disabled={selectedCount === 0}
          className="text-gray-600 hover:text-gray-900"
        >
          <Download className="h-4 w-4 mr-2" />
          Download {selectedCount > 0 && `(${selectedCount})`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onBulkDelete}
          disabled={selectedCount === 0}
          className="text-red-600 hover:text-red-900"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedCount > 0 && `(${selectedCount})`}
        </Button>
      </div>
    </div>
  );
}
