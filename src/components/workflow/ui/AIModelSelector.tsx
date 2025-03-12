
import React from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface AIModelSelectorProps {
  provider: 'openai' | 'anthropic' | 'deepseek';
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// Provider options with their respective models
const providerModels = {
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

export const AIModelSelector: React.FC<AIModelSelectorProps> = ({ 
  provider, 
  value, 
  onChange,
  className = "h-8 text-xs border-indigo-200"
}) => {
  return (
    <Select 
      value={value} 
      onValueChange={(value) => onChange(value)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {providerModels[provider].map((model) => (
          <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
