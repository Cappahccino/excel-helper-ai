
import React from 'react';
import { Database, Table } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface FileSchemaDisplayProps {
  isLoadingSchema: boolean;
  isLoadingSheetSchema: boolean;
  selectedSheet?: string;
  availableSheets: Array<{
    name: string;
    index: number;
    rowCount?: number;
    isDefault?: boolean;
  }>;
  sheetSchema: any;
  fileInfo: any;
}

const FileSchemaDisplay: React.FC<FileSchemaDisplayProps> = ({
  isLoadingSchema,
  isLoadingSheetSchema,
  selectedSheet,
  availableSheets,
  sheetSchema,
  fileInfo
}) => {
  // If we're loading the schema, show a loading indicator
  if (isLoadingSchema || isLoadingSheetSchema) {
    return (
      <div className="mt-3 border-t pt-2">
        <h4 className="text-xs font-semibold mb-1 flex items-center">
          <Database className="h-3 w-3 mr-1" /> Loading Schema...
        </h4>
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      </div>
    );
  }
  
  // If no sheet is selected, prompt the user
  if (!selectedSheet && availableSheets.length > 0) {
    return (
      <div className="mt-3 border-t pt-2">
        <div className="bg-blue-50 p-2 rounded-md text-xs text-blue-700 border border-blue-100">
          <p>Please select a sheet to view its schema.</p>
        </div>
      </div>
    );
  }
  
  // Use the sheet-specific schema from the query
  if (sheetSchema) {
    const columns = sheetSchema.columns.map((name: string, index: number) => ({
      name,
      type: sheetSchema.data_types[name] || 'string'
    }));
    
    if (!columns.length) return null;
    
    return (
      <div className="mt-3 border-t pt-2">
        <h4 className="text-xs font-semibold mb-1 flex items-center">
          <Table className="h-3 w-3 mr-1" /> Sheet Schema: {selectedSheet}
        </h4>
        <div className="max-h-28 overflow-y-auto pr-1 custom-scrollbar">
          {columns.map((column: any, index: number) => (
            <div 
              key={index} 
              className="text-xs flex gap-2 items-center p-1 border-b border-gray-100 last:border-0"
            >
              <span className="font-medium truncate max-w-28">{column.name}</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                {column.type}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // Fallback to file metadata if sheet-specific schema is not available
  if (!fileInfo?.file_metadata?.column_definitions) return null;
  
  const columnDefs = fileInfo.file_metadata.column_definitions;
  const columns = Object.keys(columnDefs).map(key => ({
    name: key,
    type: columnDefs[key] || 'string'
  }));
  
  if (!columns.length) return null;
  
  return (
    <div className="mt-3 border-t pt-2">
      <h4 className="text-xs font-semibold mb-1">File Schema (from metadata)</h4>
      <div className="max-h-28 overflow-y-auto pr-1 custom-scrollbar">
        {columns.map((column, index) => (
          <div 
            key={index} 
            className="text-xs flex gap-2 items-center p-1 border-b border-gray-100 last:border-0"
          >
            <span className="font-medium truncate max-w-28">{column.name}</span>
            <Badge variant="outline" className="h-5 text-[10px]">
              {column.type}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileSchemaDisplay;
