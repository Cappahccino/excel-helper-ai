
import React, { memo, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Brain, MessageSquare, GripVertical, Save } from 'lucide-react';
import { AINodeData } from '@/types/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

interface AskAINodeProps {
  data?: AINodeData;
  selected?: boolean;
  id?: string;
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

  const [provider, setProvider] = useState<AIProvider>(
    (nodeData.config?.aiProvider as AIProvider) || 'openai'
  );
  const [model, setModel] = useState(nodeData.config?.modelName || providerOptions[provider][0].id);
  const [prompt, setPrompt] = useState(nodeData.config?.prompt || '');
  const [systemMessage, setSystemMessage] = useState(nodeData.config?.systemMessage || '');
  const [isSaving, setIsSaving] = useState(false);

  // Update model options when provider changes
  useEffect(() => {
    setModel(providerOptions[provider][0].id);
  }, [provider]);

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
      prompt: prompt,
      systemMessage: systemMessage
    };
    
    // Update node through parent component if callback exists
    if (onConfigChange) {
      onConfigChange(id, updatedConfig);
    }
    
    // Show success message
    toast.success("Changes saved to node");
    setIsSaving(false);
  };

  // Determine appropriate icons
  const getProviderIcon = () => {
    switch (provider) {
      case 'anthropic':
        return <MessageSquare className="h-4 w-4 text-indigo-500" />;
      case 'deepseek':
        return <Brain className="h-4 w-4 text-indigo-500" />;
      case 'openai':
      default:
        return <Brain className="h-4 w-4 text-indigo-500" />;
    }
  };

  return (
    <Card className={`w-64 relative p-0 border-2 shadow-md ${selected ? 'border-indigo-500' : 'border-indigo-200'} rounded-xl`}>
      {/* Header */}
      <CardHeader className="flex flex-row items-center gap-2 bg-gradient-to-r from-indigo-100 to-indigo-50 p-2 rounded-t-xl drag-handle cursor-move">
        <GripVertical className="h-4 w-4 text-indigo-500 opacity-50" />
        {getProviderIcon()}
        <div className="text-sm font-medium text-indigo-800">{nodeData.label}</div>
      </CardHeader>
      
      {/* Body */}
      <CardContent className="p-3 pt-2 bg-white rounded-b-xl">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-indigo-700">Provider</label>
            <Select 
              value={provider} 
              onValueChange={(value: AIProvider) => setProvider(value)}
            >
              <SelectTrigger className="h-8 text-xs border-indigo-200">
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
            <label className="text-xs font-medium text-indigo-700">Model</label>
            <Select 
              value={model} 
              onValueChange={(value) => setModel(value)}
            >
              <SelectTrigger className="h-8 text-xs border-indigo-200">
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
            <label className="text-xs font-medium text-indigo-700">System Message</label>
            <Textarea 
              value={systemMessage}
              onChange={(e) => setSystemMessage(e.target.value)}
              placeholder="Enter system message..."
              className="min-h-[60px] text-xs border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400"
            />
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-medium text-indigo-700">Prompt</label>
            <Textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your query to the AI..."
              className="min-h-[60px] text-xs border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400"
            />
          </div>
          
          <Button 
            size="sm" 
            className="w-full text-xs bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 flex items-center justify-center gap-1"
            onClick={saveChanges}
            disabled={isSaving}
          >
            <Save className="h-3 w-3" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          
          {nodeData.config?.lastResponse && (
            <div className="pt-2 border-t border-gray-100">
              <div className="flex items-center text-xs font-medium text-indigo-600 mb-1">
                Last Response
              </div>
              <div className="text-xs bg-gray-50 p-2 rounded max-h-16 overflow-y-auto">
                {nodeData.config.lastResponse.substring(0, 100)}
                {nodeData.config.lastResponse.length > 100 && '...'}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      
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
          border: '2px solid white'
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
          border: '2px solid white'
        }}
      />
    </Card>
  );
};

export default memo(AskAINode);
