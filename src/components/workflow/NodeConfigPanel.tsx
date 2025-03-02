
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { WorkflowNodeData, BaseNodeData } from '@/types/workflow';

interface NodeConfigPanelProps {
  selectedNode: WorkflowNodeData | null;
  onConfigChange: (config: Partial<WorkflowNodeData>) => void;
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ selectedNode, onConfigChange }) => {
  if (!selectedNode) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>Select a node to configure</p>
      </div>
    );
  }

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onConfigChange({ ...selectedNode, label: e.target.value });
  };

  const handleConfigChange = <K extends keyof BaseNodeData['config']>(
    key: K,
    value: BaseNodeData['config'][K]
  ) => {
    onConfigChange({
      ...selectedNode,
      config: {
        ...selectedNode.config,
        [key]: value
      }
    });
  };

  // Render specific config options based on node type
  const renderNodeSpecificConfig = () => {
    if (!selectedNode) return null;

    switch (selectedNode.type) {
      case 'excelInput':
      case 'csvInput':
        return (
          <>
            <div className="grid gap-2 mb-4">
              <Label htmlFor="fileId">File</Label>
              <Input
                id="fileId"
                value={selectedNode.config.fileId as string || ''}
                onChange={(e) => handleConfigChange('fileId', e.target.value)}
                placeholder="Select a file"
              />
            </div>
            <div className="flex items-center justify-between mb-4">
              <Label htmlFor="hasHeaders">Has Headers</Label>
              <Switch
                id="hasHeaders"
                checked={!!selectedNode.config.hasHeaders}
                onCheckedChange={(checked) => handleConfigChange('hasHeaders', checked)}
              />
            </div>
          </>
        );

      case 'formulaNode':
        return (
          <div className="grid gap-2 mb-4">
            <Label htmlFor="formula">Formula</Label>
            <Textarea
              id="formula"
              value={selectedNode.config.formula as string || ''}
              onChange={(e) => handleConfigChange('formula', e.target.value)}
              placeholder="Enter your formula"
              className="min-h-[100px]"
            />
          </div>
        );

      case 'aiAnalyze':
        return (
          <>
            <div className="grid gap-2 mb-4">
              <Label htmlFor="analysisType">Analysis Type</Label>
              <Select
                value={selectedNode.config.analysisType as string || 'standard'}
                onValueChange={(value) => handleConfigChange('analysisType', value)}
              >
                <SelectTrigger id="analysisType">
                  <SelectValue placeholder="Select analysis type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Analysis</SelectItem>
                  <SelectItem value="outliers">Outlier Detection</SelectItem>
                  <SelectItem value="patterns">Pattern Recognition</SelectItem>
                  <SelectItem value="trends">Trend Analysis</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between mb-4">
              <Label htmlFor="detectOutliers">Detect Outliers</Label>
              <Switch
                id="detectOutliers"
                checked={!!selectedNode.config.analysisOptions?.detectOutliers}
                onCheckedChange={(checked) => 
                  handleConfigChange('analysisOptions', {
                    ...((selectedNode.config.analysisOptions || {}) as object),
                    detectOutliers: checked
                  })
                }
              />
            </div>
          </>
        );

      case 'conditionalBranch':
        return (
          <div className="grid gap-2 mb-4">
            <Label htmlFor="condition">Condition</Label>
            <Textarea
              id="condition"
              value={String(selectedNode.config.condition || '')}
              onChange={(e) => handleConfigChange('condition', e.target.value)}
              placeholder="Enter condition expression"
              className="min-h-[100px]"
            />
          </div>
        );

      case 'spreadsheetGenerator':
        return (
          <div className="grid gap-2 mb-4">
            <Label htmlFor="filename">Filename</Label>
            <Input
              id="filename"
              value={selectedNode.config.filename as string || 'output.xlsx'}
              onChange={(e) => handleConfigChange('filename', e.target.value)}
              placeholder="Enter filename"
            />
          </div>
        );

      default:
        return (
          <div className="p-4 text-center text-gray-500">
            <p>Configuration options for {selectedNode.type}</p>
          </div>
        );
    }
  };

  return (
    <div className="p-4 border-l border-gray-200 w-full max-w-sm overflow-y-auto">
      <h3 className="text-lg font-semibold mb-4">Node Configuration</h3>
      
      <div className="grid gap-2 mb-4">
        <Label htmlFor="nodeLabel">Label</Label>
        <Input
          id="nodeLabel"
          value={selectedNode.label}
          onChange={handleLabelChange}
          placeholder="Node label"
        />
      </div>

      <div className="grid gap-2 mb-4">
        <Label>Type</Label>
        <div className="text-sm font-medium py-2 px-3 bg-gray-100 rounded-md">
          {selectedNode.type}
        </div>
      </div>

      {renderNodeSpecificConfig()}
    </div>
  );
};

export default NodeConfigPanel;
