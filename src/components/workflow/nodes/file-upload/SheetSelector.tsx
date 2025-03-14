
import React from 'react';
import { Table } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SheetSelectorProps {
  selectedSheet?: string;
  availableSheets: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  onSheetSelect: (sheetName: string) => void;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({
  selectedSheet,
  availableSheets,
  onSheetSelect
}) => {
  if (!availableSheets.length) {
    return null;
  }

  return (
    <div>
      <Label htmlFor="sheetSelect" className="text-xs font-medium">
        Select Sheet
      </Label>
      <Select 
        value={selectedSheet} 
        onValueChange={onSheetSelect}
      >
        <SelectTrigger id="sheetSelect" className="mt-1">
          <SelectValue placeholder="Choose a sheet..." />
        </SelectTrigger>
        <SelectContent>
          {availableSheets.map((sheet) => (
            <SelectItem key={sheet.index} value={sheet.name}>
              <div className="flex items-center gap-2">
                <Table className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[180px]">{sheet.name}</span>
                {sheet.rowCount > 0 && (
                  <span className="text-xs text-gray-500">({sheet.rowCount} rows)</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SheetSelector;
