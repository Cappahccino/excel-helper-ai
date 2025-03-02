
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain, Database, FileSpreadsheet } from 'lucide-react';
import { AINodeData, NodeProps } from '@/types/workflow';

// Default data if none is provided
const defaultData: AINodeData = {
  type: 'aiAnalyze',
  label: 'AI Analysis',
  config: {}
};

const AINode: React.FC<NodeProps<AINodeData>> = ({ data, selected }) => {
  // Use provided data or fallback to default data
  const nodeData = data ? data as AINodeData : defaultData;
  const { type, label, config } = nodeData;

  // Node color based on type or configuration
  const getNodeColor = () => {
    if (config?.color) return config.color;
    return 'bg-indigo-100 border-indigo-300 text-indigo-800';
  };

  // Node icon based on type
  const getNodeIcon = () => {
    switch (type) {
      case 'aiAnalyze':
        return <Brain className="h-5 w-5 text-indigo-600" />;
      case 'aiClassify':
        return <Database className="h-5 w-5 text-indigo-600" />;
      case 'aiSummarize':
        return <FileSpreadsheet className="h-5 w-5 text-indigo-600" />;
      default:
        return <Brain className="h-5 w-5 text-indigo-600" />;
    }
  };

  return (
    <div className={`relative rounded-md border-2 px-4 py-2 shadow-md max-w-[200px] ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'} ${getNodeColor()}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-gray-400 !border-2 !border-white"
      />
      <div className="flex items-center">
        <div className="mr-2">{getNodeIcon()}</div>
        <div className="font-medium truncate text-sm">{label}</div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-gray-400 !border-2 !border-white"
      />
    </div>
  );
};

export default memo(AINode);
