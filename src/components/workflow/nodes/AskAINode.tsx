
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain, Send, MessageSquare, GripVertical, Save } from 'lucide-react';
import { AINodeData, NodeProps } from '@/types/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Define the AIProvider type
type AIProvider = 'openai' | 'anthropic' | 'deepseek';

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
const providerOptions: Record<AIProvider, Array<{id: string, name: string}>> = {
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

interface AskAINodeProps extends NodeProps<AINodeData> {
  onConfigChange?: (nodeId: string, config: Partial<AINodeData['config']>) => void;
}

const AskAINode = ({ data, selected, id, onConfigChange }: AskAINodeProps) => {
  // Use provided data or fallback to default data
  const nodeData: AINodeData = data ? {
    ...defaultData,
    ...data,
    config: {
      ...defaultData.config,
      ...(data.config || {})
    }
  } : defaultData;

  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState(nodeData.config?.prompt || '');
  const [provider, setProvider] = useState<AIProvider>(
    (nodeData.config?.aiProvider as AIProvider) || 'openai'
  );
  const [model, setModel] = useState(nodeData.config?.modelName || providerOptions[provider][0].id);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local state with node data when it changes
  useEffect(() => {
    setPrompt(nodeData.config?.prompt || '');
    setProvider((nodeData.config?.aiProvider as AIProvider) || 'openai');
    setModel(nodeData.config?.modelName || providerOptions[(nodeData.config?.aiProvider as AIProvider) || 'openai'][0].id);
  }, [nodeData.config]);

  // Save changes to node data
  const saveChanges = () => {
    if (!id) {
      toast.error("Cannot save: Node ID is missing");
      return;
    }

    setIsSaving(true);
    
    const updatedConfig = {
      aiProvider: provider,
      modelName: model,
      prompt: prompt
    };
    
    // Update node through parent component if callback exists
    if (onConfigChange) {
      onConfigChange(id, updatedConfig);
    }
    
    // Show success message and exit editing mode
    toast.success("Changes saved to node");
    setIsSaving(false);
    setIsEditing(false);
  };

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
    const provider = (nodeData.config?.aiProvider as AIProvider) || 'openai';
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
        
        <div className="ml-auto">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={() => setIsEditing(!isEditing)}
          >
            <span className="sr-only">Edit node</span>
            {isEditing ? <Save className="h-3.5 w-3.5" /> : <span className="text-xs">Edit</span>}
          </Button>
        </div>
      </div>
      
      {/* Body */}
      <div className="p-3 pt-2 bg-white rounded-b-md">
        {isEditing ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Provider</label>
              <Select 
                value={provider} 
                onValueChange={(value: AIProvider) => {
                  setProvider(value);
                  // Reset model to first available for the new provider
                  setModel(providerOptions[value][0].id);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Model</label>
              <Select 
                value={model} 
                onValueChange={(value) => setModel(value)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions[provider].map((model) => (
                    <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Prompt</label>
              <Textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter your query to the AI..."
                className="min-h-[80px] text-xs"
              />
            </div>
            
            <Button 
              size="sm" 
              className="w-full text-xs"
              onClick={saveChanges}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        ) : (
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
