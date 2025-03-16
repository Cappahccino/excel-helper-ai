
import React from 'react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers } from 'lucide-react';

interface SheetSelectorProps {
  selectedSheet?: string;
  availableSheets: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  onSheetSelect: (sheetName: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({
  selectedSheet,
  availableSheets,
  onSheetSelect,
  isLoading,
  disabled = false
}) => {
  const handleValueChange = (value: string) => {
    onSheetSelect(value);
  };

  // Stop propagation on dropdown interaction
  const handleInteraction = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (availableSheets.length === 0) {
    return null;
  }

  return (
    <div className="relative z-20" onMouseDown={handleInteraction}>
      <Label htmlFor="sheetSelect" className="text-xs font-medium">
        Select Sheet
      </Label>
      
      {isLoading ? (
        <Skeleton className="h-9 w-full mt-1" />
      ) : (
        <Select 
          value={selectedSheet} 
          onValueChange={handleValueChange}
          disabled={disabled}
        >
          <SelectTrigger 
            id="sheetSelect" 
            className="mt-1"
            onMouseDown={handleInteraction}
          >
            <SelectValue placeholder="Choose a sheet..." />
          </SelectTrigger>
          <SelectContent
            className="z-[9999] bg-white"
            position="popper"
            sideOffset={5}
            align="start"
            onMouseDown={handleInteraction}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            {availableSheets.map((sheet) => (
              <SelectItem 
                key={sheet.index} 
                value={sheet.name}
                className="focus:bg-gray-100 focus:text-gray-900 cursor-pointer"
                onMouseDown={handleInteraction}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{sheet.name}</span>
                  {sheet.rowCount && (
                    <span className="text-xs text-gray-500 ml-auto">
                      {sheet.rowCount} rows
                    </span>
                  )}
                  {sheet.isDefault && (
                    <span className="text-xs text-green-600 ml-auto">
                      Default
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

export default SheetSelector;
