
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileText, GripVertical, Mail, LineChart } from 'lucide-react';
import { NodeProps, OutputNodeData } from '@/types/workflow';

// Default data if none is provided
const defaultData: OutputNodeData = {
  label: 'Output',
  type: 'excelOutput',
  config: {}
};

const OutputNode: React.FC<NodeProps<OutputNodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data ? data as OutputNodeData : defaultData;

  // Node icon based on type
  const getNodeIcon = () => {
    switch (nodeData.type) {
      case 'excelOutput':
        return <FileText className="h-4 w-4 text-red-500" />;
      case 'dashboardOutput':
        return <LineChart className="h-4 w-4 text-red-500" />;
      case 'emailNotify':
        return <Mail className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-red-500 shadow-md' : 'border-red-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-red-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-red-500 opacity-50" />
        {getNodeIcon()}
        <div className="text-sm font-medium text-red-800">{nodeData.label || 'Output'}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Output type specific display */}
        {nodeData.type === 'excelOutput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Filename:</span>
              <span className="font-medium">{nodeData.config?.filename || 'output.xlsx'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Format:</span>
              <span className="font-medium">{nodeData.config?.format || 'XLSX'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'dashboardOutput' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Visualizations:</span>
              <span className="font-medium">{nodeData.config?.visualizations?.length || 0}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'emailNotify' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Recipients:</span>
              <span className="font-medium">{nodeData.config?.recipients?.length || 0}</span>
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
