
import React, { useState, useEffect } from 'react';
import { AINodeData } from '@/types/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, Brain, MessageSquare } from 'lucide-react';

// Define prop types for the AskAINodeConfig component
export interface AskAINodeConfigProps {
  config: AINodeData['config'];
  onConfigChange: (config: Partial<AINodeData['config']>) => void;
}

const AskAINodeConfig: React.FC<AskAINodeConfigProps> = ({ config, onConfigChange }) => {
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

  // Set up state from props
  const [provider, setProvider] = useState(config.provider || 'openai');
  const [model, setModel] = useState(config.modelName || 'gpt-4o-mini');
  const [prompt, setPrompt] = useState(config.prompt || '');
  const [systemMessage, setSystemMessage] = useState(config.systemMessage || '');

  // Update the config when inputs change
  const handleUpdateConfig = () => {
    onConfigChange({
      provider: provider,
      modelName: model,
      prompt: prompt,
      systemMessage: systemMessage
    });
  };

  // Update model options when provider changes
  useEffect(() => {
    // If current model isn't available in the new provider, select the first model
    const isModelAvailable = providerOptions[provider as keyof typeof providerOptions]
      .some(modelOption => modelOption.id === model);
    
    if (!isModelAvailable) {
      setModel(providerOptions[provider as keyof typeof providerOptions][0].id);
    }
  }, [provider, model]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">AI Provider</label>
        <Select 
          value={provider} 
          onValueChange={(value) => setProvider(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select AI provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span>OpenAI</span>
              </div>
            </SelectItem>
            <SelectItem value="anthropic">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>Anthropic</span>
              </div>
            </SelectItem>
            <SelectItem value="deepseek">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                <span>DeepSeek</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Model</label>
        <Select 
          value={model} 
          onValueChange={(value) => setModel(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions[provider as keyof typeof providerOptions].map((modelOption) => (
              <SelectItem key={modelOption.id} value={modelOption.id}>
                {modelOption.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">System Message</label>
        <Textarea 
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
          placeholder="Enter system instructions for the AI..."
          className="min-h-[80px] resize-none"
        />
      </div>
      
      <div className="space-y-2">
        <label className="text-sm font-medium">Prompt</label>
        <Textarea 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt for the AI..."
          className="min-h-[100px] resize-none"
        />
      </div>
      
      <Button 
        className="w-full" 
        onClick={handleUpdateConfig}
      >
        <Save className="h-4 w-4 mr-2" />
        Save Configuration
      </Button>
      
      {config.lastResponse && (
        <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-200">
          <h4 className="text-sm font-medium mb-1">Last Response</h4>
          <p className="text-xs text-gray-600 line-clamp-3">
            {config.lastResponse}
          </p>
        </div>
      )}
    </div>
  );
};

export default AskAINodeConfig;
