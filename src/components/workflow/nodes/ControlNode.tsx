
// src/components/workflow/nodes/ControlNode.tsx

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Edit2, GripVertical } from 'lucide-react';

interface ControlNodeData {
  label: string;
  type: string;
  config: {
    conditions?: any[];
    loopType?: string;
    mergeStrategy?: string;
    [key: string]: any;
  };
}

const ControlNode = ({ data, selected }: NodeProps<ControlNodeData>) => {
  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-gray-500 shadow-md' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-gray-500 opacity-50" />
        <Edit2 className="h-4 w-4 text-gray-500" />
        <div className="text-sm font-medium text-gray-800">{data.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Control type specific display */}
        {data.type === 'conditionalBranch' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Conditions:</span>
              <span className="font-medium">{data.config?.conditions?.length || 0}</span>
            </div>
          </div>
        )}
        
        {data.type === 'loopNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Loop type:</span>
              <span className="font-medium">{data.config?.loopType || 'For each'}</span>
            </div>
          </div>
        )}
        
        {data.type === 'mergeNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Merge strategy:</span>
              <span className="font-medium">{data.config?.mergeStrategy || 'Concatenate'}</span>
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
      
      {/* Multiple output handles for control nodes */}
      {data.type === 'conditionalBranch' && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              background: '#27B67A',
              width: 10,
              height: 10,
              bottom: -5,
              left: 'calc(30% - 5px)',
            }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{
              background: '#ef4444',
              width: 10,
              height: 10,
              bottom: -5,
              left: 'calc(70% - 5px)',
            }}
          />
          <div className="absolute bottom-2 left-0 w-full flex justify-between px-6 text-[10px] text-gray-500">
            <span>True</span>
            <span>False</span>
          </div>
        </>
      )}
      
      {data.type !== 'conditionalBranch' && (
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
      )}
    </div>
  );
};

export default memo(ControlNode);
