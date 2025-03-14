
import React, { useEffect } from 'react';
import { Table } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SheetSelectorProps {
  selectedSheet?: string;
  availableSheets: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  onSheetSelect: (sheetName: string) => void;
  isLoading?: boolean;
}

const SheetSelector: React.FC<SheetSelectorProps> = ({
  selectedSheet,
  availableSheets,
  onSheetSelect,
  isLoading = false
}) => {
  // If there are no available sheets, don't render anything
  if (!availableSheets.length) {
    return null;
  }

  // Auto-select default sheet if no sheet is selected
  useEffect(() => {
    if (!selectedSheet && availableSheets.length > 0) {
      // Find the default sheet, or use the first sheet
      const defaultSheet = availableSheets.find(sheet => sheet.isDefault) || availableSheets[0];
      if (defaultSheet) {
        console.log(`SheetSelector: Auto-selecting default sheet ${defaultSheet.name}`);
        onSheetSelect(defaultSheet.name);
      }
    }
  }, [selectedSheet, availableSheets, onSheetSelect]);

  const handleSheetSelection = (value: string) => {
    console.log(`SheetSelector: Selected sheet ${value}`);
    onSheetSelect(value);
  };

  return (
    <div>
      <Label htmlFor="sheetSelect" className="text-xs font-medium">
        Select Sheet
      </Label>
      <Select 
        value={selectedSheet} 
        onValueChange={handleSheetSelection}
        disabled={isLoading}
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
                {sheet.rowCount !== undefined && sheet.rowCount > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs">
                          {sheet.rowCount} rows
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This sheet contains {sheet.rowCount} rows of data</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {sheet.isDefault && (
                  <Badge variant="secondary" className="text-xs ml-1">Default</Badge>
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
