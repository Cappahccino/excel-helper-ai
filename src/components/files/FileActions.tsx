
import { LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FileActionsProps {
  onViewChange: (view: 'grid' | 'list') => void;
  currentView: 'grid' | 'list';
  onSearch: (query: string) => void;
  searchQuery: string;
}

export function FileActions({ onViewChange, currentView, onSearch, searchQuery }: FileActionsProps) {
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
          onClick={() => onViewChange('list')}
          className={currentView === 'list' ? 'bg-gray-100' : ''}
        >
          <List className="h-4 w-4" />
          <span className="sr-only">List view</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewChange('grid')}
          className={currentView === 'grid' ? 'bg-gray-100' : ''}
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="sr-only">Grid view</span>
        </Button>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filter
        </Button>
      </div>
    </div>
  );
}
