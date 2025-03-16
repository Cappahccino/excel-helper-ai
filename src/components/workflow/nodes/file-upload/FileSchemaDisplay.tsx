
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface FileSchemaDisplayProps {
  schemaData: {
    columns: string[];
    data_types: Record<string, string>;
    sample_data?: any[];
  };
  isLoading?: boolean;
  isLoadingSchema?: boolean;
  isLoadingSheetSchema?: boolean;
  selectedSheet?: string;
  availableSheets?: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  fileInfo?: any;
}

const FileSchemaDisplay: React.FC<FileSchemaDisplayProps> = ({ 
  schemaData, 
  isLoading = false,
  isLoadingSchema,
  isLoadingSheetSchema,
  selectedSheet,
  availableSheets,
  fileInfo
}) => {
  if (isLoading || isLoadingSchema || isLoadingSheetSchema) {
    return (
      <div className="space-y-1">
        <span className="text-xs text-gray-600 block mb-1">Schema</span>
        <div className="border rounded-md p-1">
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  if (!schemaData || !schemaData.columns || schemaData.columns.length === 0) {
    return (
      <div className="space-y-1">
        <span className="text-xs text-gray-600 block mb-1">Schema</span>
        <div className="border rounded-md p-2 text-xs text-gray-500">
          No schema available
        </div>
      </div>
    );
  }

  // Format the data type for display
  const formatType = (type: string): string => {
    if (!type) return 'unknown';
    return type.toLowerCase().replace('_', ' ');
  };

  return (
    <div className="space-y-1">
      <span className="text-xs text-gray-600 block mb-1">Schema</span>
      <div className="border rounded-md overflow-hidden">
        <ScrollArea className="h-[120px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Column</TableHead>
                <TableHead className="text-[10px]">Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schemaData.columns.map((column, index) => (
                <TableRow key={index} className={cn(index % 2 === 0 ? 'bg-gray-50' : 'bg-white')}>
                  <TableCell className="py-1 text-[10px]">{column}</TableCell>
                  <TableCell className="py-1 text-[10px]">
                    {formatType(schemaData.data_types[column] || 'unknown')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
};

export default FileSchemaDisplay;
