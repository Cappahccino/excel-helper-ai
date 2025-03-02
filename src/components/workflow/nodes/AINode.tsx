
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, GripVertical } from 'lucide-react';
import { NodeProps, AINodeData } from '@/types/workflow';

const AINode = ({ data, selected }: NodeProps<AINodeData>) => {
  // Create default data if none is provided
  const nodeData: AINodeData = data || {
    label: 'AI Operation',
    type: 'aiAnalyze',
    config: {}
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-purple-500 shadow-md' : 'border-purple-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-purple-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-purple-500 opacity-50" />
        <Zap className="h-4 w-4 text-purple-500" />
        <div className="text-sm font-medium text-purple-800">{nodeData.label || 'AI Operation'}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {/* AI type specific display */}
        {nodeData.type === 'aiAnalyze' && (
          <div className="text-xs text-gray-500">
            <div className="flex items-center justify-between mb-1">
              <span>Analysis type:</span>
              <span className="font-medium">{nodeData.config?.analysisOptions?.detectOutliers ? 'Outlier detection' : 'Standard'}</span>
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
              <span>Custom prompt:</span>
              <span className="font-medium">{nodeData.config?.prompt ? 'Yes' : 'No'}</span>
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

export default memo(AINode);
