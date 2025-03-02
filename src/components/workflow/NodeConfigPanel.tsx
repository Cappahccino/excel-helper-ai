
// src/components/workflow/NodeConfigPanel.tsx

import React from 'react';
import { Node } from '@xyflow/react';
import { X, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NodeConfigPanelProps {
  node: Node;
  onUpdateConfig: (config: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  readOnly?: boolean;
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  onUpdateConfig,
  onDelete,
  onDuplicate,
  onClose,
  readOnly = false
}) => {
  const [config, setConfig] = React.useState(node.data?.config || {});
  
  const handleChange = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdateConfig(newConfig);
  };
  
  const renderConfigFields = () => {
    const nodeType = node.data?.type;
    
    switch (nodeType) {
      case 'excelInput':
        return (
          <div className="space-y-4">
            <div>
              <Label>Excel File</Label>
              <Select
                disabled={readOnly}
                value={config.fileId || ''}
                onValueChange={(value) => handleChange('fileId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an Excel file" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder">Sample Excel File</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                disabled={readOnly}
                id="has-headers"
                checked={!!config.hasHeaders}
                onCheckedChange={(checked) => handleChange('hasHeaders', checked)}
              />
              <Label htmlFor="has-headers">First row contains headers</Label>
            </div>
          </div>
        );
        
      case 'formulaNode':
        return (
          <div className="space-y-4">
            <div>
              <Label>Formula</Label>
              <Textarea
                disabled={readOnly}
                placeholder="Enter formula expression"
                value={config.formula || ''}
                onChange={(e) => handleChange('formula', e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Example: column('A') * 2 + column('B')
              </p>
            </div>
          </div>
        );
        
      case 'aiAnalyze':
        return (
          <div className="space-y-4">
            <div>
              <Label>Analysis Type</Label>
              <Select 
                disabled={readOnly}
                value={config.analysisType || 'general'}
                onValueChange={(value) => handleChange('analysisType', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select analysis type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Analysis</SelectItem>
                  <SelectItem value="outliers">Outlier Detection</SelectItem>
                  <SelectItem value="patterns">Pattern Recognition</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                disabled={readOnly}
                id="detect-outliers"
                checked={config.analysisOptions?.detectOutliers}
                onCheckedChange={(checked) => {
                  const analysisOptions = { ...config.analysisOptions, detectOutliers: checked };
                  handleChange('analysisOptions', analysisOptions);
                }}
              />
              <Label htmlFor="detect-outliers">Detect outliers</Label>
            </div>
          </div>
        );
        
      default:
        return (
          <div className="py-4 text-center text-muted-foreground">
            No configuration options available for this node type.
          </div>
        );
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-medium">{node.data?.label || 'Node Config'}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <Tabs defaultValue="config" className="flex-1 overflow-hidden">
        <TabsList className="w-full justify-start px-4 pt-2">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        
        <div className="px-4 pt-4 pb-24 overflow-y-auto h-full">
          <TabsContent value="config" className="mt-0">
            {renderConfigFields()}
          </TabsContent>
          
          <TabsContent value="advanced" className="mt-0 space-y-4">
            <div>
              <Label>Node ID</Label>
              <Input value={node.id} disabled readOnly />
            </div>
            
            <div>
              <Label>Node Type</Label>
              <Input value={node.data?.type || ''} disabled readOnly />
            </div>
          </TabsContent>
        </div>
      </Tabs>
      
      <div className="p-4 border-t mt-auto">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicate}
            disabled={readOnly}
            className="flex-1"
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </Button>
          
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={readOnly}
            className="flex-1"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NodeConfigPanel;
