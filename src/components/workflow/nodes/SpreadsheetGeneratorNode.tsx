// src/components/workflow/nodes/SpreadsheetGeneratorNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FileSpreadsheet, GripVertical } from 'lucide-react';

const SpreadsheetGeneratorNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-teal-500 shadow-md' : 'border-teal-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-teal-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-teal-500 opacity-50" />
        <FileSpreadsheet className="h-4 w-4 text-teal-500" />
        <div className="text-sm font-medium text-teal-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between mb-1">
            <span>Filename:</span>
            <span className="font-medium">{data.config?.filename || 'Auto-generated'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Sheets:</span>
            <span className="font-medium">{data.config?.sheets?.length || 0}</span>
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
        }}
      />
      
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

export default memo(SpreadsheetGeneratorNode);
