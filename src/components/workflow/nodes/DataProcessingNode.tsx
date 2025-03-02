
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Table, GripVertical } from 'lucide-react';
import { NodeProps, DataProcessingNodeData } from '@/types/workflow';

// Default data if none is provided
const defaultData: DataProcessingNodeData = {
  label: 'Data Processing',
  type: 'dataTransform',
  config: {}
};

const DataProcessingNode: React.FC<NodeProps<DataProcessingNodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data || defaultData;

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-green-500 shadow-md' : 'border-green-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-green-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-green-500 opacity-50" />
        <Table className="h-4 w-4 text-green-500" />
        <div className="text-sm font-medium text-green-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Process type specific display */}
        {nodeData.type === 'dataTransform' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operations:</span>
              <span className="font-medium">{nodeData.config?.operations?.length || 0}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'dataCleaning' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Cleaning rules:</span>
              <span className="font-medium">{nodeData.config?.rules?.length || 0}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'formulaNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Formula:</span>
              <span className="font-medium">{nodeData.config?.formula ? 'Set' : 'Not set'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'filterNode' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Conditions:</span>
              <span className="font-medium">{nodeData.config?.conditions?.length || 0}</span>
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

export default memo(DataProcessingNode);
