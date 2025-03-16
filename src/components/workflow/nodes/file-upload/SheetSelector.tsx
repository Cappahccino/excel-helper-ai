
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface SheetMetadata {
  name: string;
  index: number;
  rowCount?: number;
  isDefault?: boolean;
}

export interface SheetSelectorProps {
  selectedSheet?: string;
  availableSheets: SheetMetadata[];
  onSheetSelect: (sheetName: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({
  selectedSheet,
  availableSheets,
  onSheetSelect,
  isLoading = false,
  disabled = false
}) => {
  if (availableSheets.length === 0) {
    return null;
  }
  
  return (
    <div className="space-y-1">
      <div className="flex items-center">
        <label className="text-xs text-gray-600 block mb-1">Sheet</label>
        {isLoading && <Loader2 className="ml-2 h-3 w-3 animate-spin text-gray-400" />}
      </div>
      <Select 
        value={selectedSheet} 
        onValueChange={onSheetSelect} 
        disabled={isLoading || disabled}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Select a sheet" />
        </SelectTrigger>
        <SelectContent>
          {availableSheets.map((sheet) => (
            <SelectItem key={sheet.index} value={sheet.name} className="text-xs">
              {sheet.name} {sheet.rowCount ? `(${sheet.rowCount} rows)` : ''}
              {sheet.isDefault ? ' (Default)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default SheetSelector;
