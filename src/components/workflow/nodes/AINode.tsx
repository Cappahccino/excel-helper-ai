
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain, Database, FileSpreadsheet, GripVertical } from 'lucide-react';
import { AINodeData, NodeProps } from '@/types/workflow';

// Default data if none is provided
const defaultData: AINodeData = {
  type: 'aiAnalyze',
  label: 'AI Analysis',
  config: {}
};

const AINode = ({ data, selected }: { data?: AINodeData, selected?: boolean }) => {
  // Use provided data or fallback to default data
  const nodeData: AINodeData = data ? {
    ...defaultData,
    ...data,
    config: {
      ...defaultData.config,
      ...(data.config || {})
    }
  } : defaultData;

  // Node icon based on type
  const getNodeIcon = () => {
    switch (nodeData.type) {
      case 'aiAnalyze':
        return <Brain className="h-4 w-4 text-purple-500" />;
      case 'aiClassify':
        return <Database className="h-4 w-4 text-purple-500" />;
      case 'aiSummarize':
        return <FileSpreadsheet className="h-4 w-4 text-purple-500" />;
      default:
        return <Brain className="h-4 w-4 text-purple-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-purple-500 shadow-md' : 'border-purple-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-purple-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-purple-500 opacity-50" />
        {getNodeIcon()}
        <div className="text-sm font-medium text-purple-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* AI type specific display */}
        {nodeData.type === 'aiAnalyze' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Analysis Type:</span>
              <span className="font-medium">{nodeData.config?.analysisType || 'Not set'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Options:</span>
              <span className="font-medium">{nodeData.config?.analysisOptions ? 'Configured' : 'Default'}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'aiClassify' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Categories:</span>
              <span className="font-medium">{nodeData.config?.classificationOptions?.categories?.length || 0}</span>
            </div>
          </div>
        )}
        
        {nodeData.type === 'aiSummarize' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Prompt:</span>
              <span className="font-medium">{nodeData.config?.prompt ? 'Set' : 'Not set'}</span>
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
          background: '#8b5cf6',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(AINode);
