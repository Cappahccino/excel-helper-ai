
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
import { useStableDropdown } from '@/hooks/useStableDropdown';
import { FileSpreadsheet } from 'lucide-react';

interface SheetSelectorProps {
  selectedSheet?: string;
  availableSheets: { name: string; index: number }[];
  onSheetSelect: (sheetName: string) => void;
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
    <div onClick={preventSelection} className="relative">
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
            className="mt-1 relative bg-white"
            ref={triggerRef}
            onClick={stopPropagation}
          >
            <SelectValue placeholder="Choose a sheet..." />
          </SelectTrigger>
          <SelectContent
            ref={contentRef}
            className="bg-white shadow-lg z-[9999]"
            position="popper"
            sideOffset={5}
            onClick={stopPropagation}
          >
            {availableSheets.map((sheet) => (
              <SelectItem 
                key={sheet.name} 
                value={sheet.name}
                className="cursor-pointer"
              >
                <div 
                  className="flex items-center gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSheetSelect(sheet.name);
                    setOpen(false);
                  }}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate max-w-[180px]">{sheet.name}</span>
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
