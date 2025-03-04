
import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AINodeData } from '@/types/workflow';

interface AskAINodeConfigProps {
  data: AINodeData;
  onUpdate: (updatedData: Partial<AINodeData>) => void;
}

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

const AskAINodeConfig: React.FC<AskAINodeConfigProps> = ({ data, onUpdate }) => {
  const [selectedProvider, setSelectedProvider] = useState<string>(data.config?.aiProvider || 'openai');
  const [selectedModel, setSelectedModel] = useState<string>(data.config?.modelName || 'gpt-4o-mini');
  const [prompt, setPrompt] = useState<string>(data.config?.prompt || '');
  const [systemMessage, setSystemMessage] = useState<string>(data.config?.systemMessage || '');

  // Update model when provider changes
  useEffect(() => {
    if (providerOptions[selectedProvider]) {
      // Set default model for this provider if current selection is invalid
      if (!providerOptions[selectedProvider].some(model => model.id === selectedModel)) {
        setSelectedModel(providerOptions[selectedProvider][0].id);
      }
    }
  }, [selectedProvider, selectedModel]);

  // When any value changes, update the parent
  useEffect(() => {
    onUpdate({
      config: {
        ...data.config,
        aiProvider: selectedProvider,
        modelName: selectedModel,
        prompt,
        systemMessage
      }
    });
  }, [selectedProvider, selectedModel, prompt, systemMessage, onUpdate, data.config]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="node-label">Node Label</Label>
        <Input 
          id="node-label" 
          value={data.label} 
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Ask AI" 
        />
      </div>

      <div>
        <Label htmlFor="ai-provider">AI Provider</Label>
        <Select 
          value={selectedProvider} 
          onValueChange={(value) => setSelectedProvider(value)}
        >
          <SelectTrigger id="ai-provider">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
            <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
            <SelectItem value="deepseek">DeepSeek</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="model-name">Model</Label>
        <Select 
          value={selectedModel} 
          onValueChange={(value) => setSelectedModel(value)}
        >
          <SelectTrigger id="model-name">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions[selectedProvider]?.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="system-message">System Message (Optional)</Label>
        <Textarea 
          id="system-message" 
          value={systemMessage} 
          onChange={(e) => setSystemMessage(e.target.value)}
          placeholder="You are an AI assistant specialized in data analysis."
          rows={3}
        />
        <p className="text-xs text-gray-500 mt-1">
          Instructions that define the AI's behavior and capabilities.
        </p>
      </div>

      <div>
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea 
          id="prompt" 
          value={prompt} 
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Ask a question..."
          rows={4}
        />
        <p className="text-xs text-gray-500 mt-1">
          Question or instructions to send to the AI model.
        </p>
      </div>

      {data.config?.lastResponse && (
        <div>
          <Label>Last Response</Label>
          <div className="p-3 bg-gray-50 rounded text-sm max-h-40 overflow-y-auto">
            {data.config.lastResponse}
          </div>
        </div>
      )}
    </div>
  );
};

export default AskAINodeConfig;
