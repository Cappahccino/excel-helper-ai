
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileSpreadsheet, GripVertical, Save, FileText, Table, Plus } from 'lucide-react';
import { NodeProps, SpreadsheetGeneratorNodeData } from '@/types/workflow';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Default data if none is provided
const defaultData: SpreadsheetGeneratorNodeData = {
  label: 'Spreadsheet Generator',
  type: 'spreadsheetGenerator',
  config: {
    filename: 'generated',
    fileExtension: 'xlsx',
    sheets: []
  }
};

interface SpreadsheetGeneratorNodeProps {
  data?: SpreadsheetGeneratorNodeData;
  selected?: boolean;
  id?: string;
  onConfigChange?: (nodeId: string, config: any) => void;
}

// Define a type for the response of check_node_logs RPC
interface NodeLogsResponse {
  has_logs: boolean;
}

// Define a type for the Excel data indicator
interface ExcelDataIndicator {
  has_excel_data: boolean;
}

// Define a type for the output data structure
interface OutputData {
  fileMetadata?: {
    sheets?: Array<{
      name: string;
      columnCount?: number;
    }>;
    filename?: string;
    format?: string;
    generatedAt?: string;
  };
  sheets?: Array<any>;
  status?: string;
  message?: string;
  timestamp?: string;
}

const SpreadsheetGeneratorNode = ({ data, selected, id, onConfigChange }: SpreadsheetGeneratorNodeProps) => {
  // Use provided data or fallback to default data
  const nodeData: SpreadsheetGeneratorNodeData = data ? {
    ...defaultData,
    ...data,
    config: {
      ...defaultData.config,
      ...(data.config || {})
    }
  } : defaultData;

  const [filename, setFilename] = useState(nodeData.config?.filename || 'generated');
  const [fileExtension, setFileExtension] = useState(nodeData.config?.fileExtension || 'xlsx');
  const [hasLogs, setHasLogs] = useState(false);
  const [hasExcelData, setHasExcelData] = useState(false);
  const [sheetCount, setSheetCount] = useState(0);

  // Check if this node has execution logs
  useEffect(() => {
    if (!id) return;
    
    const checkForLogs = async () => {
      try {
        // Use the RPC function to check for logs
        const { data, error } = await supabase
          .rpc('check_node_logs', { node_id_param: id });
        
        if (error) {
          console.log('RPC error, falling back to direct query:', error);
          // Fallback to direct query if RPC doesn't exist or fails
          const { data: rawData, error: queryError } = await supabase
            .from('workflow_step_logs')
            .select('id')
            .eq('node_id', id)
            .limit(1);
            
          if (!queryError && rawData && rawData.length > 0) {
            setHasLogs(true);
          }
        } else if (data) {
          // Handle the response safely with type checking
          if (typeof data === 'object' && data !== null && 'has_logs' in data) {
            setHasLogs((data as NodeLogsResponse).has_logs);
          }
        }

        // Check if the node has Excel data
        const { data: excelData, error: excelError } = await supabase
          .rpc('has_excel_data', { node_id_param: id });

        if (!excelError && excelData) {
          if (typeof excelData === 'object' && excelData !== null && 'has_excel_data' in excelData) {
            setHasExcelData((excelData as ExcelDataIndicator).has_excel_data);
          }
        }

        // Fetch sheet information if available
        if (hasLogs) {
          const { data: logData, error: logError } = await supabase
            .from('workflow_step_logs')
            .select('output_data')
            .eq('node_id', id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (!logError && logData && logData.length > 0) {
            const output = logData[0].output_data as OutputData;
            
            if (output && typeof output === 'object') {
              // Check for sheets in different possible output structures
              if (output.fileMetadata && Array.isArray(output.fileMetadata.sheets)) {
                setSheetCount(output.fileMetadata.sheets.length);
              } else if (output.sheets && Array.isArray(output.sheets)) {
                setSheetCount(output.sheets.length);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking for logs:', error);
      }
    };
    
    checkForLogs();
  }, [id, hasLogs]);

  const handleSave = () => {
    if (!id) {
      toast.error("Cannot save: Node ID is missing");
      return;
    }
    
    if (onConfigChange) {
      onConfigChange(id, {
        filename,
        fileExtension,
      });
      toast.success("Spreadsheet configuration saved");
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-64 ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-gradient-to-r from-blue-100 to-blue-50 p-3 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        <FileSpreadsheet className="h-4 w-4 text-blue-500" />
        <div className="text-sm font-medium text-blue-800 flex-1">{nodeData.label}</div>
        <div className="flex items-center gap-1">
          {hasExcelData && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-green-50 text-green-600 border-green-200 flex items-center gap-1"
                  >
                    <Table className="h-3 w-3" />
                    {sheetCount ? `${sheetCount} sheet${sheetCount > 1 ? 's' : ''}` : 'Data'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>This node has Excel data available</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {hasLogs && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge 
                    variant="outline" 
                    className="text-xs bg-blue-50 text-blue-600 border-blue-200 flex items-center gap-1"
                  >
                    <FileText className="h-3 w-3" />
                    Logs
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Execution logs available</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md space-y-3">
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-blue-700 font-medium">Filename:</label>
            <Input 
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="h-8 text-sm border-blue-200 focus:border-blue-400 focus:ring-blue-400"
              placeholder="Enter filename without extension"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-blue-700 font-medium">Format:</label>
            <Select 
              value={fileExtension} 
              onValueChange={(value: 'xlsx' | 'csv' | 'xls') => setFileExtension(value)}
            >
              <SelectTrigger className="h-8 text-xs border-blue-200">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">XLSX (Excel)</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xls">XLS (Legacy Excel)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2">
            <Button 
              size="sm" 
              className="w-full text-xs mt-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 flex items-center justify-center gap-1"
              onClick={handleSave}
            >
              <Save className="h-3 w-3" />
              Save Changes
            </Button>
            
            {hasExcelData && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="mt-2 px-2 border-blue-200 hover:bg-blue-50"
                      onClick={() => toast.info("Sheet configuration will be implemented in a future update")}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add/configure sheets</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
      
      {/* Input handle - top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        style={{
          background: '#94a3b8',
          width: 10,
          height: 10,
          top: -5,
          border: '2px solid white',
        }}
      />
      
      {/* Output handle - bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        style={{
          background: '#3b82f6',
          width: 10,
          height: 10,
          bottom: -5,
          border: '2px solid white',
        }}
      />
    </div>
  );
};

export default memo(SpreadsheetGeneratorNode);
