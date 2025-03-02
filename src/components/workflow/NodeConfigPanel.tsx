import React from 'react';
import { X, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkflowNode, NodeConfigPanelProps } from '@/types/workflow';
import { ExcelPreview } from '@/components/ExcelPreview';

export function NodeConfigPanel({ 
  node, 
  onUpdateConfig, 
  onDelete, 
  onDuplicate,
  onClose,
  readOnly = false 
}: NodeConfigPanelProps) {
  
  const handleConfigChange = (key: string, value: any) => {
    if (readOnly) return;
    
    const updatedConfig = {
      ...node.data?.config,
      [key]: value
    };
    
    onUpdateConfig(updatedConfig);
  };
  
  const renderConfigFields = () => {
    if (!node) return null;
    
    const nodeType = node.data?.type;
    
    if (!nodeType) {
      return <p className="text-sm text-muted-foreground">No configuration available</p>;
    }
    
    if (nodeType === 'fileUpload') {
      const fileId = node.data?.config?.fileId;
      const selectedFile = fileId ? node.data?.config?.selectedFile : null;
      
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Selected File</Label>
            {selectedFile ? (
              <div className="text-sm">{selectedFile.filename}</div>
            ) : (
              <div className="text-sm text-muted-foreground">No file selected</div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Sheet Name</Label>
            <Input 
              value={node.data?.config?.sheetName || ""}
              onChange={(e) => onUpdateConfig({ ...node.data?.config, sheetName: e.target.value })}
              placeholder="Sheet1"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label>Has Headers</Label>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="hasHeaders"
                checked={node.data?.config?.hasHeaders ?? true}
                onChange={(e) => onUpdateConfig({ ...node.data?.config, hasHeaders: e.target.checked })}
                disabled={readOnly}
              />
              <label htmlFor="hasHeaders" className="text-sm">First row contains headers</label>
            </div>
          </div>
        </div>
      );
    }
    
    if (nodeType === 'excelInput' || nodeType === 'csvInput') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="file-id">File Source</Label>
            <Select
              value={node.data?.config?.fileId || ''}
              onValueChange={(value) => handleConfigChange('fileId', value)}
              disabled={readOnly}
            >
              <SelectTrigger id="file-id">
                <SelectValue placeholder="Select a file" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="file1">Sample Excel File</SelectItem>
                <SelectItem value="file2">Customer Data</SelectItem>
                <SelectItem value="file3">Sales Report</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="has-headers">Has Headers</Label>
              <Switch
                id="has-headers"
                checked={node.data?.config?.hasHeaders || false}
                onCheckedChange={(checked) => handleConfigChange('hasHeaders', checked)}
                disabled={readOnly}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enable if your data has a header row
            </p>
          </div>
          
          {nodeType === 'csvInput' && (
            <div className="space-y-2">
              <Label htmlFor="delimiter">Delimiter</Label>
              <Select
                value={node.data?.config?.delimiter || ','}
                onValueChange={(value) => handleConfigChange('delimiter', value)}
                disabled={readOnly}
              >
                <SelectTrigger id="delimiter">
                  <SelectValue placeholder="Select delimiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Comma (,)</SelectItem>
                  <SelectItem value=";">Semicolon (;)</SelectItem>
                  <SelectItem value="\t">Tab</SelectItem>
                  <SelectItem value="|">Pipe (|)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      );
    }
    
    if (nodeType === 'dataTransform' || nodeType === 'dataCleaning' || nodeType === 'formulaNode' || nodeType === 'filterNode') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          {nodeType === 'formulaNode' && (
            <div className="space-y-2">
              <Label htmlFor="formula">Formula</Label>
              <Input
                id="formula"
                value={node.data?.config?.formula || ''}
                onChange={(e) => handleConfigChange('formula', e.target.value)}
                placeholder="e.g. column1 * 2 + column2"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Enter a formula using column names as variables
              </p>
            </div>
          )}
          
          {nodeType === 'filterNode' && (
            <div className="space-y-2">
              <Label htmlFor="filter-condition">Filter Condition</Label>
              <Input
                id="filter-condition"
                value={node.data?.config?.filterCondition || ''}
                onChange={(e) => handleConfigChange('filterCondition', e.target.value)}
                placeholder="e.g. column1 > 100"
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                Enter a condition to filter rows
              </p>
            </div>
          )}
        </div>
      );
    }
    
    if (nodeType === 'aiAnalyze' || nodeType === 'aiClassify' || nodeType === 'aiSummarize') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="prompt">AI Prompt</Label>
            <Input
              id="prompt"
              value={node.data?.config?.prompt || ''}
              onChange={(e) => handleConfigChange('prompt', e.target.value)}
              placeholder="Enter instructions for the AI"
              disabled={readOnly}
            />
          </div>
          
          {nodeType === 'aiAnalyze' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="detect-outliers">Detect Outliers</Label>
                <Switch
                  id="detect-outliers"
                  checked={node.data?.config?.analysisOptions?.detectOutliers || false}
                  onCheckedChange={(checked) => {
                    const analysisOptions = {
                      ...(node.data?.config?.analysisOptions || {}),
                      detectOutliers: checked
                    };
                    handleConfigChange('analysisOptions', analysisOptions);
                  }}
                  disabled={readOnly}
                />
              </div>
            </div>
          )}
        </div>
      );
    }
    
    if (nodeType === 'excelOutput' || nodeType === 'dashboardOutput' || nodeType === 'emailNotify') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          {nodeType === 'excelOutput' && (
            <div className="space-y-2">
              <Label htmlFor="filename">Output Filename</Label>
              <Input
                id="filename"
                value={node.data?.config?.filename || ''}
                onChange={(e) => handleConfigChange('filename', e.target.value)}
                placeholder="e.g. processed_data.xlsx"
                disabled={readOnly}
              />
            </div>
          )}
          
          {nodeType === 'emailNotify' && (
            <div className="space-y-2">
              <Label htmlFor="recipients">Email Recipients</Label>
              <Input
                id="recipients"
                value={node.data?.config?.recipients?.join(', ') || ''}
                onChange={(e) => {
                  const recipients = e.target.value.split(',').map(email => email.trim());
                  handleConfigChange('recipients', recipients);
                }}
                placeholder="e.g. user@example.com, another@example.com"
                disabled={readOnly}
              />
            </div>
          )}
        </div>
      );
    }
    
    if (nodeType === 'xeroConnect' || nodeType === 'salesforceConnect' || nodeType === 'googleSheetsConnect') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="operation">Operation</Label>
            <Select
              value={node.data?.config?.operation || ''}
              onValueChange={(value) => handleConfigChange('operation', value)}
              disabled={readOnly}
            >
              <SelectTrigger id="operation">
                <SelectValue placeholder="Select operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read Data</SelectItem>
                <SelectItem value="write">Write Data</SelectItem>
                <SelectItem value="update">Update Data</SelectItem>
                <SelectItem value="delete">Delete Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }
    
    if (nodeType === 'conditionalBranch' || nodeType === 'loopNode' || nodeType === 'mergeNode') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          {nodeType === 'conditionalBranch' && (
            <div className="space-y-2">
              <Label htmlFor="condition">Condition</Label>
              <Input
                id="condition"
                value={node.data?.config?.condition || ''}
                onChange={(e) => handleConfigChange('condition', e.target.value)}
                placeholder="e.g. value > 100"
                disabled={readOnly}
              />
            </div>
          )}
          
          {nodeType === 'loopNode' && (
            <div className="space-y-2">
              <Label htmlFor="loop-type">Loop Type</Label>
              <Select
                value={node.data?.config?.loopType || ''}
                onValueChange={(value) => handleConfigChange('loopType', value)}
                disabled={readOnly}
              >
                <SelectTrigger id="loop-type">
                  <SelectValue placeholder="Select loop type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="forEach">For Each</SelectItem>
                  <SelectItem value="while">While</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      );
    }
    
    if (nodeType === 'spreadsheetGenerator') {
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-name">Node Name</Label>
            <Input
              id="node-name"
              value={node.data?.label || ''}
              onChange={(e) => onUpdateConfig({ ...node.data, label: e.target.value })}
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="filename">Output Filename</Label>
            <Input
              id="filename"
              value={node.data?.config?.filename || ''}
              onChange={(e) => handleConfigChange('filename', e.target.value)}
              placeholder="e.g. generated_report.xlsx"
              disabled={readOnly}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="include-headers">Include Headers</Label>
              <Switch
                id="include-headers"
                checked={node.data?.config?.includeHeaders || true}
                onCheckedChange={(checked) => handleConfigChange('includeHeaders', checked)}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>
      );
    }
    
    return <p className="text-sm text-muted-foreground">No configuration available for this node type</p>;
  };
  
  return (
    <div className="w-full max-w-sm mx-auto bg-background border rounded-lg shadow-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-medium">Node Configuration</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="p-4 overflow-y-auto max-h-[calc(100vh-12rem)]">
        {renderConfigFields()}
      </div>
      
      {!readOnly && (
        <div className="flex justify-between items-center p-4 border-t">
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicate}
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplicate
          </Button>
        </div>
      )}
    </div>
  );
}

export default NodeConfigPanel;
