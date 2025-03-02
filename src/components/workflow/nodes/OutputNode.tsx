
// src/components/workflow/nodes/OutputNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileText, GripVertical } from 'lucide-react';

interface OutputNodeData {
  label: string;
  type: string;
  config: {
    filename?: string;
    format?: string;
    visualizations?: any[];
    recipients?: string[];
    [key: string]: any;
  };
}

const OutputNode = ({ data, selected }: NodeProps<OutputNodeData>) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-red-500 shadow-md' : 'border-red-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-red-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-red-500 opacity-50" />
        <FileText className="h-4 w-4 text-red-500" />
        <div className="text-sm font-medium text-red-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Output type specific display */}
        {data.type === 'excelOutput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Filename:</span>
              <span className="font-medium">{data.config?.filename || 'output.xlsx'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Format:</span>
              <span className="font-medium">{data.config?.format || 'XLSX'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'dashboardOutput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Visualizations:</span>
              <span className="font-medium">{data.config?.visualizations?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'emailNotify' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Recipients:</span>
              <span className="font-medium">{data.config?.recipients?.length || 0}</span>
            </div>
          </div>
        )}
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
    </div>
  );
};

export default memo(OutputNode);
