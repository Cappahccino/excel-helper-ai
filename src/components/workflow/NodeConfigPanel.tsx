
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Copy, Save, Trash } from "lucide-react";
import { WorkflowNode, WorkflowNodeData } from '@/types/workflow';

export interface NodeConfigPanelProps {
  nodeData: WorkflowNodeData;
  onUpdateConfig: (updatedNodeData: Partial<WorkflowNodeData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
  readOnly?: boolean;
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  nodeData,
  onUpdateConfig,
  onDelete,
  onDuplicate,
  onClose,
  readOnly = false
}) => {
  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateConfig({ label: e.target.value });
  };

  const handleConfigChange = (key: string, value: any) => {
    onUpdateConfig({
      config: {
        ...nodeData.config,
        [key]: value,
      },
    } as Partial<WorkflowNodeData>);
  };

  // Render different config options based on node type
  const renderNodeSpecificConfig = () => {
    switch (nodeData.type) {
      case 'excelInput':
      case 'csvInput':
      case 'apiSource':
        return (
          <>
            <div className="space-y-2">
              <Label htmlFor="fileId">File ID</Label>
              <Input
                id="fileId"
                value={nodeData.config.fileId || ''}
                onChange={(e) => handleConfigChange('fileId', e.target.value)}
                readOnly={readOnly}
              />
            </div>
            
            <div className="space-y-2 mt-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="hasHeaders">Has Headers</Label>
                <Switch
                  id="hasHeaders"
                  checked={!!nodeData.config.hasHeaders}
                  onCheckedChange={(checked) => handleConfigChange('hasHeaders', checked)}
                  disabled={readOnly}
                />
              </div>
            </div>
          </>
        );
      
      case 'formulaNode':
        return (
          <div className="space-y-2">
            <Label htmlFor="formula">Formula</Label>
            <Textarea
              id="formula"
              value={nodeData.config.formula || ''}
              onChange={(e) => handleConfigChange('formula', e.target.value)}
              readOnly={readOnly}
              rows={5}
              placeholder="Enter formula e.g. = A1 + B2 * C3"
            />
          </div>
        );
      
      case 'aiAnalyze':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="analysisType">Analysis Type</Label>
              <Select
                value={nodeData.config.analysisType || 'general'}
                onValueChange={(value) => handleConfigChange('analysisType', value)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select analysis type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Analysis</SelectItem>
                  <SelectItem value="trends">Trend Analysis</SelectItem>
                  <SelectItem value="outliers">Outlier Detection</SelectItem>
                  <SelectItem value="forecast">Forecasting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="detectOutliers">Detect Outliers</Label>
                <Switch
                  id="detectOutliers"
                  checked={!!(nodeData.config.analysisOptions?.detectOutliers)}
                  onCheckedChange={(checked) => 
                    handleConfigChange('analysisOptions', {
                      ...nodeData.config.analysisOptions,
                      detectOutliers: checked
                    })
                  }
                  disabled={readOnly}
                />
              </div>
            </div>
          </div>
        );
      
      default:
        return (
          <CardDescription>
            This node type ({nodeData.type}) doesn't have specific configuration options.
          </CardDescription>
        );
    }
  };

  return (
    <Card className="w-[400px] h-full overflow-y-auto">
      <CardHeader className="sticky top-0 bg-white z-10 border-b">
        <div className="flex justify-between items-center">
          <CardTitle>Node Configuration</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <CardDescription>Configure the node properties</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <div className="space-y-2">
          <Label htmlFor="node-label">Label</Label>
          <Input
            id="node-label"
            value={nodeData.label}
            onChange={handleLabelChange}
            readOnly={readOnly}
          />
        </div>

        <Tabs defaultValue="config">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
          </TabsList>
          <TabsContent value="config" className="space-y-4 mt-4">
            {renderNodeSpecificConfig()}
          </TabsContent>
          <TabsContent value="appearance" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="node-color">Node Color</Label>
              <Select 
                value={nodeData.config.color || "blue"} 
                onValueChange={(color) => handleConfigChange('color', color)}
                disabled={readOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="red">Red</SelectItem>
                  <SelectItem value="purple">Purple</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        {!readOnly && (
          <div className="flex gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1" 
              onClick={onDuplicate}
            >
              <Copy className="h-4 w-4 mr-2" /> Duplicate
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              className="flex-1" 
              onClick={onDelete}
            >
              <Trash className="h-4 w-4 mr-2" /> Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NodeConfigPanel;
