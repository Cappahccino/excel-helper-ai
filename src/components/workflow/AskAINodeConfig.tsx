
import React, { useState, useEffect } from 'react';
import { AINodeData } from '@/types/workflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

// Define the AIProvider type
type AIProvider = 'openai' | 'anthropic' | 'deepseek';

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

interface AskAINodeConfigProps {
  data: AINodeData;
  onUpdate: (updatedConfig: Partial<AINodeData['config']>) => void;
}

const AskAINodeConfig: React.FC<AskAINodeConfigProps> = ({ data, onUpdate }) => {
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(
    (data.config?.aiProvider as AIProvider) || 'openai'
  );
  
  const [selectedModel, setSelectedModel] = useState(
    data.config?.modelName || providerOptions[selectedProvider][0].id
  );
  
  const [prompt, setPrompt] = useState(data.config?.prompt || '');
  const [systemMessage, setSystemMessage] = useState(data.config?.systemMessage || '');
  
  // When provider changes, update model to first in new provider's list
  useEffect(() => {
    if (!providerOptions[selectedProvider].some(model => model.id === selectedModel)) {
      setSelectedModel(providerOptions[selectedProvider][0].id);
    }
  }, [selectedProvider, selectedModel]);
  
  const handleSave = () => {
    onUpdate({
      aiProvider: selectedProvider,
      modelName: selectedModel,
      prompt,
      systemMessage
    });
  };
  
  return (
    <div className="p-4 space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">AI Provider</label>
          <Select 
            value={selectedProvider} 
            onValueChange={(value: AIProvider) => setSelectedProvider(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select AI provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="deepseek">DeepSeek</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Model</label>
          <Select 
            value={selectedModel} 
            onValueChange={setSelectedModel}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {providerOptions[selectedProvider].map(model => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Prompt</label>
          <Textarea
            placeholder="Enter your prompt to the AI..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px]"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">System Message (Optional)</label>
          <Textarea
            placeholder="Instructions for the AI..."
            value={systemMessage}
            onChange={(e) => setSystemMessage(e.target.value)}
            className="min-h-[80px]"
          />
        </div>
      </div>
      
      {data.config?.lastResponse && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Last Response</h4>
            <div className="text-xs bg-gray-50 p-3 rounded max-h-32 overflow-y-auto">
              {data.config.lastResponse}
            </div>
          </CardContent>
        </Card>
      )}
      
      <Button 
        className="w-full" 
        onClick={handleSave}
      >
        Save Configuration
      </Button>
    </div>
  );
};

export default AskAINodeConfig;
