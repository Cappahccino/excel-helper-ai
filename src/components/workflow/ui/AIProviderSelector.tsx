
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

export type AIProvider = 'openai' | 'anthropic' | 'deepseek';

interface AIProviderSelectorProps {
  value: AIProvider;
  onChange: (value: AIProvider) => void;
  className?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

export const AIProviderSelector: React.FC<AIProviderSelectorProps> = ({ 
  value, 
  onChange,
  className = "h-8 text-xs border-indigo-200",
  label = "AI Provider",
  description,
  disabled = false,
  required = false,
  error
}) => {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor="ai-provider" className="text-xs font-medium">
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
        onValueChange={(value: AIProvider) => onChange(value)}
        disabled={disabled}
      >
        <SelectTrigger 
          className={`${className} ${error ? 'border-red-400 border-2' : ''}`}
          aria-invalid={!!error}
        >
          <SelectValue placeholder="Select provider" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="openai">OpenAI</SelectItem>
          <SelectItem value="anthropic">Anthropic</SelectItem>
          <SelectItem value="deepseek">DeepSeek</SelectItem>
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
};
