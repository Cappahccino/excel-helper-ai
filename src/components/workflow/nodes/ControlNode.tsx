
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Edit2, GripVertical, GitBranch, RefreshCw, MergeTool } from 'lucide-react';
import { NodeProps, ControlNodeData } from '@/types/workflow';

// Default data if none is provided
const defaultData: ControlNodeData = {
  label: 'Control',
  type: 'conditionalBranch',
  config: {}
};

const ControlNode: React.FC<NodeProps<ControlNodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data ? data as ControlNodeData : defaultData;

  // Node icon based on type
  const getNodeIcon = () => {
    switch (nodeData.type) {
      case 'conditionalBranch':
        return <GitBranch className="h-4 w-4 text-gray-500" />;
      case 'loopNode':
        return <RefreshCw className="h-4 w-4 text-gray-500" />;
      case 'mergeNode':
        return <MergeTool className="h-4 w-4 text-gray-500" />;
      default:
        return <Edit2 className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-gray-500 shadow-md' : 'border-gray-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-gray-500 opacity-50" />
        {getNodeIcon()}
        <div className="text-sm font-medium text-gray-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Control type specific display */}
        {nodeData.type === 'conditionalBranch' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Conditions:</span>
              <span className="font-medium">{nodeData.config?.conditions?.length || 0}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'loopNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Loop type:</span>
              <span className="font-medium">{nodeData.config?.loopType || 'For each'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'mergeNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Merge strategy:</span>
              <span className="font-medium">{nodeData.config?.mergeStrategy || 'Concatenate'}</span>
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
      
      {/* Multiple output handles for conditional branches */}
      {nodeData.type === 'conditionalBranch' && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              background: '#22c55e',
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
      
      {nodeData.type !== 'conditionalBranch' && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="output"
          style={{
            background: '#64748b',
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
