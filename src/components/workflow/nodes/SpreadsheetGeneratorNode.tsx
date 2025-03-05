
import React, { memo, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileSpreadsheet, GripVertical } from 'lucide-react';
import { NodeProps, SpreadsheetGeneratorNodeData } from '@/types/workflow';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

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

const SpreadsheetGeneratorNode = ({ data, selected, id, onConfigChange }: { 
  data?: SpreadsheetGeneratorNodeData, 
  selected?: boolean,
  id?: string,
  onConfigChange?: (nodeId: string, config: any) => void 
}) => {
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
    <div className={`relative p-0 rounded-lg border-2 w-64 transition-all ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50 p-3 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        <FileSpreadsheet className="h-4 w-4 text-blue-500" />
        <div className="text-sm font-medium text-blue-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="text-blue-700 font-medium">Filename:</label>
            <Input 
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="h-8 text-sm"
              placeholder="Enter filename without extension"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-blue-700 font-medium">Format:</label>
            <Select 
              value={fileExtension} 
              onValueChange={(value: 'xlsx' | 'csv' | 'xls') => setFileExtension(value)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">XLSX (Excel)</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xls">XLS (Legacy Excel)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            size="sm" 
            className="w-full text-xs mt-2 bg-blue-600 hover:bg-blue-700"
            onClick={handleSave}
          >
            Save Changes
          </Button>
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
        }}
      />
    </div>
  );
};

export default memo(SpreadsheetGeneratorNode);
