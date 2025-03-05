
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileSpreadsheet, GripVertical, Save, FileText } from 'lucide-react';
import { NodeProps, SpreadsheetGeneratorNodeData } from '@/types/workflow';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

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
interface NodeLogsCheckResult {
  has_logs: boolean;
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

  // Check if this node has execution logs
  useEffect(() => {
    if (!id) return;
    
    const checkForLogs = async () => {
      try {
        // Use the RPC function to check for logs with proper typing
        const { data, error } = await supabase
          .rpc<NodeLogsCheckResult, { node_id_param: string }>('check_node_logs', { node_id_param: id })
          .single();
        
        if (error) {
          console.log('RPC error, falling back to direct query:', error);
          // Fallback to direct query if RPC doesn't exist or fails
          const { data: rawData, error: queryError } = await supabase
            .from('workflow_step_logs' as any)
            .select('id')
            .eq('node_id', id)
            .limit(1);
            
          if (!queryError && rawData && rawData.length > 0) {
            setHasLogs(true);
          }
        } else if (data && typeof data === 'object' && 'has_logs' in data) {
          setHasLogs(data.has_logs);
        }
      } catch (error) {
        console.error('Error checking for logs:', error);
      }
    };
    
    checkForLogs();
  }, [id]);

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
        {hasLogs && (
          <Badge 
            variant="outline" 
            className="text-xs bg-blue-50 text-blue-600 border-blue-200 flex items-center gap-1"
            title="Execution logs available"
          >
            <FileText className="h-3 w-3" />
            Logs
          </Badge>
        )}
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
          
          <Button 
            size="sm" 
            className="w-full text-xs mt-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 flex items-center justify-center gap-1"
            onClick={handleSave}
          >
            <Save className="h-3 w-3" />
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
