
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Database, GripVertical, FileText, Globe, User } from 'lucide-react';
import { NodeProps, DataInputNodeData } from '@/types/workflow';

// Default data if none is provided
const defaultData: DataInputNodeData = {
  label: 'Data Input',
  type: 'excelInput',
  config: {}
};

const DataInputNode: React.FC<NodeProps<DataInputNodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data ? data as DataInputNodeData : defaultData;

  // Node icon based on type
  const getNodeIcon = () => {
    switch (nodeData.type) {
      case 'excelInput':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'csvInput':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'apiSource':
        return <Globe className="h-4 w-4 text-blue-500" />;
      case 'userInput':
        return <User className="h-4 w-4 text-blue-500" />;
      default:
        return <Database className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        {getNodeIcon()}
        <div className="text-sm font-medium text-blue-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Input type specific display */}
        {nodeData.type === 'excelInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{nodeData.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Headers:</span>
              <span className="font-medium">{nodeData.config?.hasHeaders ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'csvInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{nodeData.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delimiter:</span>
              <span className="font-medium">{nodeData.config?.delimiter || ','}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'apiSource' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>API Endpoint:</span>
              <span className="font-medium">{nodeData.config?.endpoint ? 'Configured' : 'Not set'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'userInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Form fields:</span>
              <span className="font-medium">{nodeData.config?.fields?.length || 0}</span>
            </div>
          </div>
        )}
      </div>
      
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

export default memo(DataInputNode);
