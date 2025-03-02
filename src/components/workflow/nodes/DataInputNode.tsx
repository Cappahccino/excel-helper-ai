
// src/components/workflow/nodes/DataInputNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Database, GripVertical } from 'lucide-react';

interface DataInputNodeData {
  label: string;
  type: string;
  config: {
    fileId?: string | null;
    hasHeaders?: boolean;
    delimiter?: string;
    endpoint?: string;
    fields?: any[];
    [key: string]: any;
  };
}

const DataInputNode = ({ data, selected }: NodeProps<DataInputNodeData>) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-blue-500 shadow-md' : 'border-blue-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-blue-500 opacity-50" />
        <Database className="h-4 w-4 text-blue-500" />
        <div className="text-sm font-medium text-blue-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Input type specific display */}
        {data.type === 'excelInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{data.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Headers:</span>
              <span className="font-medium">{data.config?.hasHeaders ? 'Yes' : 'No'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'csvInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>File:</span>
              <span className="font-medium">{data.config?.fileId ? 'Selected' : 'Not selected'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Delimiter:</span>
              <span className="font-medium">{data.config?.delimiter || ','}</span>
            </div>
          </div>
        )}
        
        {data.type === 'apiSource' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>API Endpoint:</span>
              <span className="font-medium">{data.config?.endpoint ? 'Configured' : 'Not set'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'userInput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Form fields:</span>
              <span className="font-medium">{data.config?.fields?.length || 0}</span>
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
          background: '#27B67A',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(DataInputNode);
