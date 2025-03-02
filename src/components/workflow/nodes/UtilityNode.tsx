
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { ClipboardList, GripVertical, Clock, Variable, Activity } from 'lucide-react';
import { NodeProps, UtilityNodeData } from '@/types/workflow';

// Default data if none is provided
const defaultData: UtilityNodeData = {
  label: 'Utility',
  type: 'logToConsole',
  config: {}
};

const UtilityNode: React.FC<NodeProps<UtilityNodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data ? data as UtilityNodeData : defaultData;

  // Node icon based on type
  const getNodeIcon = () => {
    switch (nodeData.type) {
      case 'logToConsole':
        return <ClipboardList className="h-4 w-4 text-slate-500" />;
      case 'executionTimestamp':
        return <Clock className="h-4 w-4 text-slate-500" />;
      case 'variableStorage':
        return <Variable className="h-4 w-4 text-slate-500" />;
      case 'performanceMetrics':
        return <Activity className="h-4 w-4 text-slate-500" />;
      default:
        return <ClipboardList className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-slate-500 shadow-md' : 'border-slate-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-slate-500 opacity-50" />
        {getNodeIcon()}
        <div className="text-sm font-medium text-slate-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* Utility type specific display */}
        {nodeData.type === 'logToConsole' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Log Level:</span>
              <span className="font-medium">{nodeData.config?.logLevel || 'info'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'executionTimestamp' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Format:</span>
              <span className="font-medium">ISO 8601</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'variableStorage' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Variable Key:</span>
              <span className="font-medium">{nodeData.config?.variableKey || 'Not set'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'performanceMetrics' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Threshold:</span>
              <span className="font-medium">{nodeData.config?.performanceThreshold || 'None'}</span>
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
          background: '#64748b',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(UtilityNode);
