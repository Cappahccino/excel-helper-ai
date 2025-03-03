
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Brain, Bug, Clock, RefreshCw } from 'lucide-react';
import { AINodeData } from '@/types/workflow';

interface AskAINodeConfigProps {
  nodeData: AINodeData;
  onChange: (data: AINodeData) => void;
  onClose: () => void;
}

const AskAINodeConfig = ({ nodeData, onChange, onClose }: AskAINodeConfigProps) => {
  const [localData, setLocalData] = useState<AINodeData>({
    ...nodeData,
    config: {
      ...nodeData.config
    }
  });

  const handleInputChange = (field: string, value: any) => {
    setLocalData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    onChange(localData);
    onClose();
  };

  const getModelOptions = () => {
    const provider = localData.config?.aiProvider || 'openai';
    
    switch (provider) {
      case 'openai':
        return [
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
          { value: 'gpt-4o', label: 'GPT-4o' }
        ];
      case 'anthropic':
        return [
          { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
          { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
          { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' }
        ];
      case 'deepseek':
        return [
          { value: 'deepseek-chat', label: 'Deepseek Chat' },
          { value: 'deepseek-coder', label: 'Deepseek Coder' }
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4 p-1">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-medium">Ask AI Node Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="label">Node Label</Label>
            <Input
              id="label"
              value={localData.label}
              onChange={(e) => setLocalData(prev => ({ ...prev, label: e.target.value }))}
              placeholder="Enter node label"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="aiProvider">AI Provider</Label>
            <Select
              value={localData.config?.aiProvider || 'openai'}
              onValueChange={(value) => handleInputChange('aiProvider', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select AI provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                <SelectItem value="deepseek">Deepseek AI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="modelName">Model</Label>
            <Select
              value={localData.config?.modelName || ''}
              onValueChange={(value) => handleInputChange('modelName', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {getModelOptions().map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="prompt">Default Prompt (Optional)</Label>
            <Textarea
              id="prompt"
              value={localData.config?.prompt || ''}
              onChange={(e) => handleInputChange('prompt', e.target.value)}
              placeholder="Enter a default prompt for this node"
              rows={3}
            />
            <p className="text-xs text-gray-500">
              This prompt will be used as default but can be overridden by input data.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="systemMessage">System Message (Optional)</Label>
            <Textarea
              id="systemMessage"
              value={localData.config?.systemMessage || ''}
              onChange={(e) => handleInputChange('systemMessage', e.target.value)}
              placeholder="Enter a system message to guide the AI's behavior"
              rows={3}
            />
            <p className="text-xs text-gray-500">
              System messages help guide the AI's behavior and set context.
            </p>
          </div>

          {localData.config?.lastResponse && (
            <Card className="mt-4 bg-gray-50 border-gray-200">
              <CardHeader className="py-2 px-3">
                <div className="flex items-center text-sm font-medium text-gray-800">
                  <Clock className="h-4 w-4 mr-2 text-gray-500" />
                  <span>Last Response</span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({localData.config?.lastResponseTime ? new Date(localData.config.lastResponseTime).toLocaleString() : 'Unknown time'})
                  </span>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-3">
                <div className="text-sm bg-white p-2 rounded border border-gray-200 max-h-32 overflow-auto">
                  {localData.config?.lastResponse}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Save Configuration</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AskAINodeConfig;
