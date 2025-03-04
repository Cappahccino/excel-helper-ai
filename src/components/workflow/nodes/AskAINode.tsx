
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
    modelName: 'gpt-4o-mini',
    prompt: '',
    systemMessage: ''
  }
};

// Provider options with their respective models
const providerOptions = {
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'gpt-4o', name: 'GPT-4o' }
  ],
  anthropic: [
    { id: 'claude-3-haiku-20240307', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' }
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    { id: 'deepseek-coder', name: 'DeepSeek Coder' }
  ]
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

  // Get the current provider's model name for display
  const getModelDisplayName = () => {
    const provider = nodeData.config?.aiProvider || 'openai';
    const modelId = nodeData.config?.modelName;
    
    if (!modelId) return 'Not selected';
    
    const modelOption = providerOptions[provider]?.find(model => model.id === modelId);
    return modelOption?.name || modelId;
  };

  return (
    <div className={`relative p-0 rounded-lg border-2 w-64 transition-all ${selected ? 'border-indigo-500 shadow-md' : 'border-indigo-200'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-t-md drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-indigo-500 opacity-50" />
        {getProviderIcon()}
        <div className="text-sm font-medium text-indigo-800">{nodeData.label}</div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        <div className="text-xs text-gray-600">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Provider:</span>
            <span className="capitalize">{nodeData.config?.aiProvider || 'OpenAI'}</span>
          </div>
          
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Model:</span>
            <span>{getModelDisplayName()}</span>
          </div>
          
          {nodeData.config?.prompt && (
            <div className="mb-2">
              <span className="font-medium block mb-1">Prompt:</span>
              <div className="text-xs bg-gray-50 p-2 rounded max-h-16 overflow-y-auto">
                {nodeData.config.prompt}
              </div>
            </div>
          )}
          
          {nodeData.config?.lastResponse && (
            <div className="mt-3 pt-2 border-t border-gray-100">
              <div className="flex items-center text-xs font-medium text-indigo-600 mb-1">
                <Send className="h-3 w-3 mr-1" />
                Last Response
              </div>
              <div className="text-xs bg-gray-50 p-2 rounded max-h-16 overflow-y-auto">
                {nodeData.config.lastResponse.substring(0, 100)}
                {nodeData.config.lastResponse.length > 100 && '...'}
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
