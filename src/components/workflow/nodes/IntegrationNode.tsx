
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileSearch, GripVertical } from 'lucide-react';
import { NodeProps, IntegrationNodeData } from '@/types/workflow';

// Default data if none is provided
const defaultData: IntegrationNodeData = {
  label: 'Integration',
  type: 'xeroConnect',
  config: {}
};

const IntegrationNode: React.FC<NodeProps<IntegrationNodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data || defaultData;

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-orange-500 shadow-md' : 'border-orange-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-orange-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-orange-500 opacity-50" />
        <FileSearch className="h-4 w-4 text-orange-500" />
        <div className="text-sm font-medium text-orange-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Integration type specific display */}
        {nodeData.type === 'xeroConnect' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operation:</span>
              <span className="font-medium">{nodeData.config?.operation || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Auth status:</span>
              <span className="font-medium">{nodeData.config?.credentials ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'salesforceConnect' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operation:</span>
              <span className="font-medium">{nodeData.config?.operation || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Auth status:</span>
              <span className="font-medium">{nodeData.config?.credentials ? 'Connected' : 'Not connected'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'googleSheetsConnect' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Operation:</span>
              <span className="font-medium">{nodeData.config?.operation || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Sheet ID:</span>
              <span className="font-medium">{nodeData.config?.spreadsheetId ? 'Set' : 'Not set'}</span>
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

export default memo(IntegrationNode);
