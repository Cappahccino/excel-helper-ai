
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
import { useStableDropdown } from '@/hooks/useStableDropdown';

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
  const {
    stopPropagation,
    dropdownRef,
    triggerRef
  } = useStableDropdown();

  const handleValueChange = (value: string) => {
    onSheetSelect(value);
  };

  if (availableSheets.length === 0) {
    return null;
  }

  return (
    <div className="relative z-20" onMouseDown={stopPropagation}>
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
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
            ref={triggerRef}
          >
            <SelectValue placeholder="Choose a sheet..." />
          </SelectTrigger>
          <SelectContent
            ref={dropdownRef}
            className="z-[9999] bg-white"
            position="popper"
            sideOffset={5}
            align="start"
            onMouseDown={stopPropagation}
            onClick={stopPropagation}
            onPointerDownOutside={(e) => {
              // This prevents the dropdown from closing when clicking inside the dropdown
              e.preventDefault();
            }}
          >
            {availableSheets.map((sheet) => (
              <SelectItem 
                key={sheet.index} 
                value={sheet.name}
                className="focus:bg-gray-100 focus:text-gray-900 cursor-pointer"
                onMouseDown={stopPropagation}
                onClick={stopPropagation}
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
