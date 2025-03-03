
import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain, Send, MessageSquare, GripVertical } from 'lucide-react';
import { AINodeData, NodeProps } from '@/types/workflow';

// Default data if none is provided
const defaultData: AINodeData = {
  type: 'askAI',
  label: 'Ask AI',
  config: {
    aiProvider: 'openai',
    prompt: '',
    systemMessage: '',
    modelName: ''
  }
};

const AskAINode = ({ data, selected }: { data?: AINodeData, selected?: boolean }) => {
  // Use provided data or fallback to default data
  const nodeData: AINodeData = data ? {
    ...defaultData,
    ...data,
    config: {
      ...defaultData.config,
      ...(data.config || {})
    }
  } : defaultData;

  // Determine appropriate icons
  const getProviderIcon = () => {
    const provider = nodeData.config?.aiProvider || 'openai';
    
    switch (provider) {
      case 'anthropic':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'deepseek':
        return <Brain className="h-4 w-4 text-green-500" />;
      case 'openai':
      default:
        return <Brain className="h-4 w-4 text-purple-500" />;
    }
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-60 transition-all ${selected ? 'border-indigo-500 shadow-md' : 'border-indigo-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-indigo-500 opacity-50" />
        {getProviderIcon()}
        <div className="text-sm font-medium text-indigo-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between mb-1">
            <span>Provider:</span>
            <span className="font-medium capitalize">{nodeData.config?.aiProvider || 'OpenAI'}</span>
          </div>
          
          {nodeData.config?.modelName && (
            <div className="flex items-center justify-between mb-1">
              <span>Model:</span>
              <span className="font-medium">{nodeData.config.modelName}</span>
            </div>
          )}
          
          {nodeData.config?.prompt && (
            <div className="mb-1">
              <span className="font-medium">Prompt:</span>
              <div className="text-xs text-gray-600 mt-1 bg-gray-50 p-1 rounded max-h-10 overflow-hidden">
                {nodeData.config.prompt.substring(0, 60)}
                {nodeData.config.prompt.length > 60 && '...'}
              </div>
            </div>
          )}
          
          {nodeData.config?.lastResponse && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center text-xs font-medium text-indigo-600">
                <Send className="h-3 w-3 mr-1" />
                Last Response
              </div>
            </div>
          )}
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
          background: '#818cf8',
          width: 10,
          height: 10,
          bottom: -5,
        }}
      />
    </div>
  );
};

export default memo(AskAINode);
