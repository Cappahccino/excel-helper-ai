
import React from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStableDropdown } from '@/hooks/useStableDropdown';

interface SheetSelectorProps {
  selectedSheet?: string;
  availableSheets: { name: string; index: number; rowCount?: number; isDefault?: boolean }[];
  onSheetSelect: (sheet: string) => void;
  isLoading: boolean;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({
  selectedSheet,
  availableSheets,
  onSheetSelect,
  isLoading
}) => {
  const {
    open,
    setOpen,
    triggerRef,
    contentRef,
    preventSelection,
    stopPropagation
  } = useStableDropdown();

  return (
    <div onClick={preventSelection}>
      <Label htmlFor="sheetSelect" className="text-xs font-medium">
        Select Sheet
      </Label>
      
      {isLoading ? (
        <Skeleton className="h-9 w-full mt-1" />
      ) : (
        <Select 
          open={open}
          onOpenChange={setOpen}
          value={selectedSheet} 
          onValueChange={(value) => {
            onSheetSelect(value);
            setOpen(false);
          }}
        >
          <SelectTrigger 
            id="sheetSelect" 
            className="mt-1 relative z-50 bg-white"
            ref={triggerRef}
            onClick={stopPropagation}
          >
            <SelectValue placeholder="Choose a sheet..." />
          </SelectTrigger>
          <SelectContent
            ref={contentRef}
            className="z-[9999] bg-white shadow-lg"
            position="popper"
            sideOffset={5}
            onClick={stopPropagation}
          >
            {availableSheets?.map((sheet) => (
              <SelectItem 
                key={sheet.name} 
                value={sheet.name}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-3.5 w-3.5 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="truncate max-w-[180px]">{sheet.name}</span>
                    {sheet.rowCount !== undefined && (
                      <span className="text-[10px] text-gray-500">
                        {sheet.rowCount.toLocaleString()} rows
                      </span>
                    )}
                  </div>
                  {sheet.isDefault && (
                    <span className="ml-auto text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                      default
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
