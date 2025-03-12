
import React from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';

interface AIProviderSelectorProps {
  value: 'openai' | 'anthropic' | 'deepseek';
  onChange: (value: 'openai' | 'anthropic' | 'deepseek') => void;
  className?: string;
}

export const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({ 
  value, 
  onChange,
  className = "h-8 text-xs border-indigo-200"
}) => {
  return (
    <Select 
      value={value} 
      onValueChange={(value: any) => onChange(value)}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select provider" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="openai">OpenAI</SelectItem>
        <SelectItem value="anthropic">Anthropic</SelectItem>
        <SelectItem value="deepseek">DeepSeek</SelectItem>
      </SelectContent>
    </Select>
  );
};
