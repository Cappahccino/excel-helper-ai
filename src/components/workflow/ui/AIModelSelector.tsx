
import React from 'react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { AIProvider } from './AIProviderSelector';

interface AIModelSelectorProps {
  provider: AIProvider;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
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
  className = "h-8 text-xs border-indigo-200",
  label = "AI Model",
  description,
  disabled = false,
  required = false,
  error
}) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor="ai-model" className="text-xs font-medium">
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          {description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-gray-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs max-w-60">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}
      <Select 
        value={value} 
        onValueChange={(value) => onChange(value)}
        disabled={disabled}
      >
        <SelectTrigger 
          className={`${className} ${error ? 'border-red-400 border-2' : ''}`}
          aria-invalid={!!error}
        >
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {providerModels[provider].map((model) => (
            <SelectItem key={model.id} value={model.id}>{model.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
};
