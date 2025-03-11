import React, { useState } from 'react';
import { AINodeData } from '@/types/workflow';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface AskAINodeConfigProps {
  node: AINodeData;
  onConfigChange: (config: Partial<AINodeData['config']>) => void;
}

// Provider options with their models
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

const AskAINodeConfig: React.FC<AskAINodeConfigProps> = ({ node, onConfigChange }) => {
  const { config = {} } = node;
  
  // Extract config values with defaults
  const selectedProvider = config.provider || 'openai';
  const selectedModel = config.modelName || providerOptions.openai[0].id;
  const currentPrompt = config.prompt || '';
  const currentSystemMessage = config.systemMessage || '';
  
  // State for form values
  const [provider, setProvider] = useState<string>(selectedProvider);
  const [model, setModel] = useState<string>(selectedModel);
  const [prompt, setPrompt] = useState<string>(currentPrompt);
  const [systemMessage, setSystemMessage] = useState<string>(currentSystemMessage);
  
  // Get available models for current provider
  const availableModels = providerOptions[provider as keyof typeof providerOptions] || [];
  
  const handleSave = () => {
    onConfigChange({
      provider: provider,
      modelName: model,
      prompt,
      systemMessage
    });
    
    toast.success('Settings saved');
  };
  
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="provider">Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger id="provider">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI</SelectItem>
            <SelectItem value="anthropic">Anthropic</SelectItem>
            <SelectItem value="deepseek">DeepSeek</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label htmlFor="model">Model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger id="model">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label htmlFor="systemMessage">System Message</Label>
        <Textarea 
          id="systemMessage"
          value={systemMessage}
          onChange={(e) => setSystemMessage(e.target.value)}
          placeholder="Enter system message..."
        />
      </div>
      
      <div>
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea 
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your query to the AI..."
        />
      </div>
      
      <Button onClick={handleSave}>Save Settings</Button>
    </div>
  );
};

export default AskAINodeConfig;
