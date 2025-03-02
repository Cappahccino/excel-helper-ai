// src/components/workflow/NodeConfigPanel.tsx

import React, { useState, useEffect } from 'react';
import { Node } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { X, Copy, Trash2, Settings, Code, FileText, Zap, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const [activeTab, setActiveTab] = useState<string>('config');
  const [config, setConfig] = useState<any>(node?.data?.config || {});
  
  // Update local config when node changes
  useEffect(() => {
    setConfig(node?.data?.config || {});
  }, [node]);
  
  // Update parent component when config changes
  const updateConfig = (newConfig: any) => {
    setConfig(newConfig);
    onUpdateConfig(newConfig);
  };
  
  // Handle configuration for specific node types
  const renderNodeConfig = () => {
    if (!node?.data?.type) return null;
    
    switch (node.data.type) {
      case 'excelInput':
        return renderExcelInputConfig();
        
      case 'csvInput':
        return renderCsvInputConfig();
        
      case 'apiSource':
        return renderApiSourceConfig();
        
      case 'userInput':
        return renderUserInputConfig();
        
      case 'dataTransform':
        return renderDataTransformConfig();
        
      case 'dataCleaning':
        return renderDataCleaningConfig();
        
      case 'formulaNode':
        return renderFormulaNodeConfig();
        
      case 'filterNode':
        return renderFilterNodeConfig();
        
      case 'aiAnalyze':
        return renderAiAnalyzeConfig();
        
      case 'aiClassify':
        return renderAiClassifyConfig();
        
      case 'aiSummarize':
        return renderAiSummarizeConfig();
        
      case 'xeroConnect':
      case 'salesforceConnect':
      case 'googleSheetsConnect':
        return renderIntegrationConfig();
        
      case 'excelOutput':
        return renderExcelOutputConfig();
        
      case 'dashboardOutput':
        return renderDashboardOutputConfig();
        
      case 'emailNotify':
        return renderEmailNotifyConfig();
        
      case 'conditionalBranch':
        return renderConditionalBranchConfig();
        
      case 'loopNode':
        return renderLoopNodeConfig();
        
      case 'mergeNode':
        return renderMergeNodeConfig();
        
      case 'spreadsheetGenerator':
        return renderSpreadsheetGeneratorConfig();
        
      default:
        return (
          <div className="py-4 px-2 text-center text-gray-500">
            No configuration available for this node type.
          </div>
        );
    }
  };
  
  // Configuration panels for each node type
  const renderExcelInputConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fileId">Excel File</Label>
          <Select
            disabled={readOnly}
            value={config.fileId || ''}
            onValueChange={(value) => updateConfig({ ...config, fileId: value })}
          >
            <SelectTrigger id="fileId">
              <SelectValue placeholder="Select a file" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No file selected</SelectItem>
              {/* This would be populated with files from your database */}
              <SelectItem value="file1">sales_data.xlsx</SelectItem>
              <SelectItem value="file2">inventory_report.xlsx</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="sheet">Sheet Name</Label>
          <Input
            id="sheet"
            disabled={readOnly}
            value={config.sheet || ''}
            onChange={(e) => updateConfig({ ...config, sheet: e.target.value })}
            placeholder="Sheet1"
          />
          <p className="text-xs text-gray-500">
            Leave blank to use the first sheet
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="range">Cell Range</Label>
          <Input
            id="range"
            disabled={readOnly}
            value={config.range || ''}
            onChange={(e) => updateConfig({ ...config, range: e.target.value })}
            placeholder="A1:H20"
          />
          <p className="text-xs text-gray-500">
            Leave blank to use all data
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasHeaders"
            disabled={readOnly}
            checked={config.hasHeaders !== false}
            onCheckedChange={(checked) => updateConfig({ ...config, hasHeaders: checked === true })}
          />
          <Label htmlFor="hasHeaders">First row contains headers</Label>
        </div>
      </div>
    );
  };
  
  const renderCsvInputConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fileId">CSV File</Label>
          <Select
            disabled={readOnly}
            value={config.fileId || ''}
            onValueChange={(value) => updateConfig({ ...config, fileId: value })}
          >
            <SelectTrigger id="fileId">
              <SelectValue placeholder="Select a file" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No file selected</SelectItem>
              {/* This would be populated with files from your database */}
              <SelectItem value="file1">sales_data.csv</SelectItem>
              <SelectItem value="file2">inventory_report.csv</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="delimiter">Delimiter</Label>
          <Select
            disabled={readOnly}
            value={config.delimiter || ','}
            onValueChange={(value) => updateConfig({ ...config, delimiter: value })}
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
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hasHeaders"
            disabled={readOnly}
            checked={config.hasHeaders !== false}
            onCheckedChange={(checked) => updateConfig({ ...config, hasHeaders: checked === true })}
          />
          <Label htmlFor="hasHeaders">First row contains headers</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="trimValues"
            disabled={readOnly}
            checked={config.trimValues === true}
            onCheckedChange={(checked) => updateConfig({ ...config, trimValues: checked === true })}
          />
          <Label htmlFor="trimValues">Trim whitespace from values</Label>
        </div>
      </div>
    );
  };
  
  const renderApiSourceConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="endpoint">API Endpoint</Label>
          <Input
            id="endpoint"
            disabled={readOnly}
            value={config.endpoint || ''}
            onChange={(e) => updateConfig({ ...config, endpoint: e.target.value })}
            placeholder="https://api.example.com/data"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="method">HTTP Method</Label>
          <Select
            disabled={readOnly}
            value={config.method || 'GET'}
            onValueChange={(value) => updateConfig({ ...config, method: value })}
          >
            <SelectTrigger id="method">
              <SelectValue placeholder="Select method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label>Headers</Label>
          {(config.headers || []).map((header: any, index: number) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                disabled={readOnly}
                value={header.key || ''}
                onChange={(e) => {
                  const newHeaders = [...(config.headers || [])];
                  newHeaders[index] = { ...header, key: e.target.value };
                  updateConfig({ ...config, headers: newHeaders });
                }}
                placeholder="Header name"
                className="flex-1"
              />
              <Input
                disabled={readOnly}
                value={header.value || ''}
                onChange={(e) => {
                  const newHeaders = [...(config.headers || [])];
                  newHeaders[index] = { ...header, value: e.target.value };
                  updateConfig({ ...config, headers: newHeaders });
                }}
                placeholder="Value"
                className="flex-1"
              />
              <Button
                disabled={readOnly}
                variant="ghost"
                size="icon"
                onClick={() => {
                  const newHeaders = [...(config.headers || [])];
                  newHeaders.splice(index, 1);
                  updateConfig({ ...config, headers: newHeaders });
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            disabled={readOnly}
            variant="outline"
            size="sm"
            onClick={() => {
              const newHeaders = [...(config.headers || []), { key: '', value: '' }];
              updateConfig({ ...config, headers: newHeaders });
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Header
          </Button>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="requestBody">Request Body</Label>
          <Textarea
            id="requestBody"
            disabled={readOnly}
            value={config.requestBody || ''}
            onChange={(e) => updateConfig({ ...config, requestBody: e.target.value })}
            placeholder="{}"
            rows={5}
          />
          <p className="text-xs text-gray-500">
            JSON format for POST/PUT requests
          </p>
        </div>
      </div>
    );
  };
  
  const renderUserInputConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Input Fields</Label>
          {(config.fields || []).map((field: any, index: number) => (
            <div key={index} className="border rounded-md p-3 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">Field {index + 1}</h4>
                <Button
                  disabled={readOnly}
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newFields = [...(config.fields || [])];
                    newFields.splice(index, 1);
                    updateConfig({ ...config, fields: newFields });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`field-name-${index}`}>Field Name</Label>
                <Input
                  id={`field-name-${index}`}
                  disabled={readOnly}
                  value={field.name || ''}
                  onChange={(e) => {
                    const newFields = [...(config.fields || [])];
                    newFields[index] = { ...field, name: e.target.value };
                    updateConfig({ ...config, fields: newFields });
                  }}
                  placeholder="name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`field-label-${index}`}>Display Label</Label>
                <Input
                  id={`field-label-${index}`}
                  disabled={readOnly}
                  value={field.label || ''}
                  onChange={(e) => {
                    const newFields = [...(config.fields || [])];
                    newFields[index] = { ...field, label: e.target.value };
                    updateConfig({ ...config, fields: newFields });
                  }}
                  placeholder="Field Label"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`field-type-${index}`}>Field Type</Label>
                <Select
                  disabled={readOnly}
                  value={field.type || 'text'}
                  onValueChange={(value) => {
                    const newFields = [...(config.fields || [])];
                    newFields[index] = { ...field, type: value };
                    updateConfig({ ...config, fields: newFields });
                  }}
                >
                  <SelectTrigger id={`field-type-${index}`}>
                    <SelectValue placeholder="Select field type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="select">Dropdown</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor={`field-required-${index}`}>Required</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`field-required-${index}`}
                    disabled={readOnly}
                    checked={field.required === true}
                    onCheckedChange={(checked) => {
                      const newFields = [...(config.fields || [])];
                      newFields[index] = { ...field, required: checked === true };
                      updateConfig({ ...config, fields: newFields });
                    }}
                  />
                  <Label htmlFor={`field-required-${index}`}>Field is required</Label>
                </div>
              </div>
            </div>
          ))}
          
          <Button
            disabled={readOnly}
            variant="outline"
            size="sm"
            onClick={() => {
              const newFields = [...(config.fields || []), { 
                name: '', 
                label: '', 
                type: 'text',
                required: false 
              }];
              updateConfig({ ...config, fields: newFields });
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Field
          </Button>
        </div>
      </div>
    );
  };
  
  const renderDataTransformConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Transformation Operations</Label>
            <Button
              disabled={readOnly}
              variant="outline"
              size="sm"
              onClick={() => {
                const newOperations = [...(config.operations || []), { 
                  type: 'map',
                  config: {} 
                }];
                updateConfig({ ...config, operations: newOperations });
              }}
            >
              <Plus className="h-4 w-4 mr-2" /> Add Operation
            </Button>
          </div>
          
          {(config.operations || []).length === 0 ? (
            <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
              No operations configured. Add an operation to get started.
            </div>
          ) : (
            <Accordion type="single" collapsible className="border rounded-md">
              {(config.operations || []).map((operation: any, index: number) => (
                <AccordionItem key={index} value={`operation-${index}`}>
                  <AccordionTrigger className="px-4">
                    <div className="flex items-center gap-2">
                      <span>
                        {operation.type === 'map' && 'Map Fields'}
                        {operation.type === 'filter' && 'Filter Data'}
                        {operation.type === 'sort' && 'Sort Data'}
                        {operation.type === 'group' && 'Group Data'}
                        {operation.type === 'aggregate' && 'Aggregate Data'}
                        {operation.type === 'join' && 'Join Data'}
                      </span>
                      <span className="text-xs text-gray-500">#{index + 1}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`operation-type-${index}`}>Operation Type</Label>
                      <Select
                        disabled={readOnly}
                        value={operation.type}
                        onValueChange={(value) => {
                          const newOperations = [...(config.operations || [])];
                          newOperations[index] = { 
                            type: value,
                            config: {} // Reset config when changing type
                          };
                          updateConfig({ ...config, operations: newOperations });
                        }}
                      >
                        <SelectTrigger id={`operation-type-${index}`}>
                          <SelectValue placeholder="Select operation type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="map">Map Fields</SelectItem>
                          <SelectItem value="filter">Filter Data</SelectItem>
                          <SelectItem value="sort">Sort Data</SelectItem>
                          <SelectItem value="group">Group Data</SelectItem>
                          <SelectItem value="aggregate">Aggregate Data</SelectItem>
                          <SelectItem value="join">Join Data</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Render config based on operation type */}
                    {operation.type === 'map' && (
                      <div className="space-y-3">
                        <Label>Field Mappings</Label>
                        {Object.entries(operation.config?.mappings || {}).map(([target, source]: [string, any], mapIndex: number) => (
                          <div key={mapIndex} className="flex gap-2 items-center">
                            <Input
                              disabled={readOnly}
                              value={target}
                              onChange={(e) => {
                                const newMappings = { ...operation.config?.mappings };
                                const sourceValue = newMappings[target];
                                delete newMappings[target];
                                newMappings[e.target.value] = sourceValue;
                                
                                const newOperations = [...(config.operations || [])];
                                newOperations[index] = { 
                                  ...operation,
                                  config: { ...operation.config, mappings: newMappings }
                                };
                                updateConfig({ ...config, operations: newOperations });
                              }}
                              placeholder="Target field"
                              className="flex-1"
                            />
                            <span className="text-gray-500">=</span>
                            <Input
                              disabled={readOnly}
                              value={typeof source === 'string' ? source : source?.formula || ''}
                              onChange={(e) => {
                                const newMappings = { ...operation.config?.mappings };
                                newMappings[target] = e.target.value;
                                
                                const newOperations = [...(config.operations || [])];
                                newOperations[index] = { 
                                  ...operation,
                                  config: { ...operation.config, mappings: newMappings }
                                };
                                updateConfig({ ...config, operations: newOperations });
                              }}
                              placeholder="Source field or formula"
                              className="flex-1"
                            />
                            <Button
                              disabled={readOnly}
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const newMappings = { ...operation.config?.mappings };
                                delete newMappings[target];
                                
                                const newOperations = [...(config.operations || [])];
                                newOperations[index] = { 
                                  ...operation,
                                  config: { ...operation.config, mappings: newMappings }
                                };
                                updateConfig({ ...config, operations: newOperations });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          disabled={readOnly}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const newMappings = { 
                              ...operation.config?.mappings || {},
                              [`field${Object.keys(operation.config?.mappings || {}).length + 1}`]: '' 
                            };
                            
                            const newOperations = [...(config.operations || [])];
                            newOperations[index] = { 
                              ...operation,
                              config: { ...operation.config, mappings: newMappings }
                            };
                            updateConfig({ ...config, operations: newOperations });
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add Mapping
                        </Button>
                      </div>
                    )}
                    
                    {/* Similar configurations for other operation types */}
                    {/* For brevity, I'm only showing the map operation config in detail */}
                    {operation.type === 'filter' && (
                      <div className="text-sm text-gray-500">
                        Filter configuration would go here
                      </div>
                    )}
                    
                    {operation.type === 'sort' && (
                      <div className="text-sm text-gray-500">
                        Sort configuration would go here
                      </div>
                    )}
                    
                    {operation.type === 'group' && (
                      <div className="text-sm text-gray-500">
                        Group configuration would go here
                      </div>
                    )}
                    
                    {operation.type === 'aggregate' && (
                      <div className="text-sm text-gray-500">
                        Aggregate configuration would go here
                      </div>
                    )}
                    
                    {operation.type === 'join' && (
                      <div className="text-sm text-gray-500">
                        Join configuration would go here
                      </div>
                    )}
                    
                    <Button
                      disabled={readOnly}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newOperations = [...(config.operations || [])];
                        newOperations.splice(index, 1);
                        updateConfig({ ...config, operations: newOperations });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Remove Operation
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>
    );
  };
  
  const renderDataCleaningConfig = () => {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
          Data cleaning configuration would go here
        </div>
      </div>
    );
  };
  
  const renderFormulaNodeConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="formula">Formula</Label>
          <Textarea
            id="formula"
            disabled={readOnly}
            value={config.formula || ''}
            onChange={(e) => updateConfig({ ...config, formula: e.target.value })}
            placeholder="e.g., A1 + B1 * C1"
            rows={5}
          />
          <p className="text-xs text-gray-500">
            Use Excel-like formula syntax
          </p>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="outputField">Output Field</Label>
          <Input
            id="outputField"
            disabled={readOnly}
            value={config.outputField || ''}
            onChange={(e) => updateConfig({ ...config, outputField: e.target.value })}
            placeholder="result"
          />
          <p className="text-xs text-gray-500">
            Name of the field to store the formula result
          </p>
        </div>
      </div>
    );
  };
  
  const renderFilterNodeConfig = () => {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
          Filter node configuration would go here
        </div>
      </div>
    );
  };
  
  const renderAiAnalyzeConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="operation">Analysis Type</Label>
          <Select
            disabled={readOnly}
            value={config.operation || 'analyze'}
            onValueChange={(value) => updateConfig({ ...config, operation: value })}
          >
            <SelectTrigger id="operation">
              <SelectValue placeholder="Select analysis type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="analyze">General Analysis</SelectItem>
              <SelectItem value="extract">Extract Data</SelectItem>
              <SelectItem value="classify">Classify Data</SelectItem>
              <SelectItem value="generate_formula">Generate Formula</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="prompt">Custom Prompt</Label>
          <Textarea
            id="prompt"
            disabled={readOnly}
            value={config.prompt || ''}
            onChange={(e) => updateConfig({ ...config, prompt: e.target.value })}
            placeholder="Write a custom prompt for the AI..."
            rows={4}
          />
          <p className="text-xs text-gray-500">
            Leave blank to use the default prompt
          </p>
        </div>
        
        <div className="space-y-2">
          <Label>Analysis Options</Label>
          <div className="space-y-2 border rounded-md p-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="detectOutliers"
                disabled={readOnly}
                checked={(config.analysisOptions?.detectOutliers) === true}
                onCheckedChange={(checked) => {
                  const newOptions = { ...config.analysisOptions, detectOutliers: checked === true };
                  updateConfig({ ...config, analysisOptions: newOptions });
                }}
              />
              <Label htmlFor="detectOutliers">Detect outliers</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="findPatterns"
                disabled={readOnly}
                checked={(config.analysisOptions?.findPatterns) === true}
                onCheckedChange={(checked) => {
                  const newOptions = { ...config.analysisOptions, findPatterns: checked === true };
                  updateConfig({ ...config, analysisOptions: newOptions });
                }}
              />
              <Label htmlFor="findPatterns">Find patterns</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="identifyTrends"
                disabled={readOnly}
                checked={(config.analysisOptions?.identifyTrends) === true}
                onCheckedChange={(checked) => {
                  const newOptions = { ...config.analysisOptions, identifyTrends: checked === true };
                  updateConfig({ ...config, analysisOptions: newOptions });
                }}
              />
              <Label htmlFor="identifyTrends">Identify trends</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="suggestImprovements"
                disabled={readOnly}
                checked={(config.analysisOptions?.suggestImprovements) === true}
                onCheckedChange={(checked) => {
                  const newOptions = { ...config.analysisOptions, suggestImprovements: checked === true };
                  updateConfig({ ...config, analysisOptions: newOptions });
                }}
              />
              <Label htmlFor="suggestImprovements">Suggest improvements</Label>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  const renderAiClassifyConfig = () => {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
          AI classification configuration would go here
        </div>
      </div>
    );
  };
  
  const renderAiSummarizeConfig = () => {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
          AI summarization configuration would go here
        </div>
      </div>
    );
  };
  
  const renderIntegrationConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="operation">Operation</Label>
          <Select
            disabled={readOnly}
            value={config.operation || ''}
            onValueChange={(value) => updateConfig({ ...config, operation: value })}
          >
            <SelectTrigger id="operation">
              <SelectValue placeholder="Select operation" />
            </SelectTrigger>
            <SelectContent>
              {node.data.type === 'xeroConnect' && (
                <>
                  <SelectItem value="create_invoice">Create Invoice</SelectItem>
                  <SelectItem value="get_invoices">Get Invoices</SelectItem>
                  <SelectItem value="create_contact">Create Contact</SelectItem>
                </>
              )}
              
              {node.data.type === 'salesforceConnect' && (
                <>
                  <SelectItem value="create_lead">Create Lead</SelectItem>
                  <SelectItem value="get_opportunities">Get Opportunities</SelectItem>
                  <SelectItem value="update_account">Update Account</SelectItem>
                </>
              )}
              
              {node.data.type === 'googleSheetsConnect' && (
                <>
                  <SelectItem value="append_values">Append Values</SelectItem>
                  <SelectItem value="get_values">Get Values</SelectItem>
                  <SelectItem value="update_values">Update Values</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="credentials">Authentication</Label>
          <Select
            disabled={readOnly}
            value={config.authentication?.credentialId || ''}
            onValueChange={(value) => updateConfig({ 
              ...config, 
              authentication: { 
                ...config.authentication,
                credentialId: value 
              } 
            })}
          >
            <SelectTrigger id="credentials">
              <SelectValue placeholder="Select credentials" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No credentials selected</SelectItem>
              {/* This would be populated with credentials from your database */}
              <SelectItem value="cred1">My Xero Account</SelectItem>
              <SelectItem value="cred2">Company Salesforce</SelectItem>
              <SelectItem value="cred3">Google Workspace</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            Select the credentials to use for this integration
          </p>
        </div>
        
        {node.data.type === 'googleSheetsConnect' && (
          <div className="space-y-2">
            <Label htmlFor="spreadsheetId">Spreadsheet ID</Label>
            <Input
              id="spreadsheetId"
              disabled={readOnly}
              value={config.spreadsheetId || ''}
              onChange={(e) => updateConfig({ ...config, spreadsheetId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
            />
            <p className="text-xs text-gray-500">
              The ID from the Google Sheets URL
            </p>
          </div>
        )}
        
        <div className="space-y-2">
          <Label>Mappings</Label>
          <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
            Configuration for field mappings would go here (similar to the dataTransform node)
          </div>
        </div>
      </div>
    );
  };
  
  const renderExcelOutputConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="filename">Filename</Label>
          <Input
            id="filename"
            disabled={readOnly}
            value={config.filename || ''}
            onChange={(e) => updateConfig({ ...config, filename: e.target.value })}
            placeholder="output.xlsx"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="format">Format</Label>
          <Select
            disabled={readOnly}
            value={config.format || 'xlsx'}
            onValueChange={(value) => updateConfig({ ...config, format: value })}
          >
            <SelectTrigger id="format">
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              <SelectItem value="csv">CSV (.csv)</SelectItem>
              <SelectItem value="xls">Excel 97-2003 (.xls)</SelectItem>
              <SelectItem value="ods">OpenDocument (.ods)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="includeHeaders"
            disabled={readOnly}
            checked={config.includeHeaders !== false}
            onCheckedChange={(checked) => updateConfig({ ...config, includeHeaders: checked === true })}
          />
          <Label htmlFor="includeHeaders">Include headers</Label>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="autoDownload"
            disabled={readOnly}
            checked={config.autoDownload === true}
            onCheckedChange={(checked) => updateConfig({ ...config, autoDownload: checked === true })}
          />
          <Label htmlFor="autoDownload">Download file automatically</Label>
        </div>
      </div>
    );
  };
  
  const renderDashboardOutputConfig = () => {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
          Dashboard output configuration would go here
        </div>
      </div>
    );
  };
  
  const renderEmailNotifyConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Recipients</Label>
          {(config.recipients || []).map((recipient: string, index: number) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                disabled={readOnly}
                value={recipient}
                onChange={(e) => {
                  const newRecipients = [...(config.recipients || [])];
                  newRecipients[index] = e.target.value;
                  updateConfig({ ...config, recipients: newRecipients });
                }}
                placeholder="email@example.com"
                className="flex-1"
              />
              <Button
                disabled={readOnly}
                variant="ghost"
                size="icon"
                onClick={() => {
                  const newRecipients = [...(config.recipients || [])];
                  newRecipients.splice(index, 1);
                  updateConfig({ ...config, recipients: newRecipients });
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            disabled={readOnly}
            variant="outline"
            size="sm"
            onClick={() => {
              const newRecipients = [...(config.recipients || []), ''];
              updateConfig({ ...config, recipients: newRecipients });
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Recipient
          </Button>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            disabled={readOnly}
            value={config.subject || ''}
            onChange={(e) => updateConfig({ ...config, subject: e.target.value })}
            placeholder="Workflow Result"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="body">Email Body</Label>
          <Textarea
            id="body"
            disabled={readOnly}
            value={config.body || ''}
            onChange={(e) => updateConfig({ ...config, body: e.target.value })}
            placeholder="The workflow has completed. Here are the results..."
            rows={5}
          />
          <p className="text-xs text-gray-500">
            You can use {{placeholders}} for dynamic content
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Checkbox
            id="attachResults"
            disabled={readOnly}
            checked={config.attachResults === true}
            onCheckedChange={(checked) => updateConfig({ ...config, attachResults: checked === true })}
          />
          <Label htmlFor="attachResults">Attach results</Label>
        </div>
      </div>
    );
  };
  
  const renderConditionalBranchConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Conditions</Label>
          {(config.conditions || []).map((condition: any, index: number) => (
            <div key={index} className="border rounded-md p-3 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <Input
                  disabled={readOnly}
                  value={condition.field || ''}
                  onChange={(e) => {
                    const newConditions = [...(config.conditions || [])];
                    newConditions[index] = { ...condition, field: e.target.value };
                    updateConfig({ ...config, conditions: newConditions });
                  }}
                  placeholder="Field"
                  className="w-28"
                />
                <Select
                  disabled={readOnly}
                  value={condition.operator || 'equals'}
                  onValueChange={(value) => {
                    const newConditions = [...(config.conditions || [])];
                    newConditions[index] = { ...condition, operator: value };
                    updateConfig({ ...config, conditions: newConditions });
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Operator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="notEquals">Not equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="greaterThan">Greater than</SelectItem>
                    <SelectItem value="lessThan">Less than</SelectItem>
                    <SelectItem value="isEmpty">Is empty</SelectItem>
                    <SelectItem value="isNotEmpty">Is not empty</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  disabled={readOnly || ['isEmpty', 'isNotEmpty'].includes(condition.operator || '')}
                  value={condition.value || ''}
                  onChange={(e) => {
                    const newConditions = [...(config.conditions || [])];
                    newConditions[index] = { ...condition, value: e.target.value };
                    updateConfig({ ...config, conditions: newConditions });
                  }}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  disabled={readOnly}
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newConditions = [...(config.conditions || [])];
                    newConditions.splice(index, 1);
                    updateConfig({ ...config, conditions: newConditions });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            disabled={readOnly}
            variant="outline"
            size="sm"
            onClick={() => {
              const newConditions = [...(config.conditions || []), { 
                field: '',
                operator: 'equals',
                value: ''
              }];
              updateConfig({ ...config, conditions: newConditions });
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Condition
          </Button>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="operator">Logical Operator</Label>
          <Select
            disabled={readOnly}
            value={config.operator || 'and'}
            onValueChange={(value) => updateConfig({ ...config, operator: value })}
          >
            <SelectTrigger id="operator">
              <SelectValue placeholder="Select operator" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="and">AND (all conditions must be true)</SelectItem>
              <SelectItem value="or">OR (any condition can be true)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };
  
  const renderLoopNodeConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="loopType">Loop Type</Label>
          <Select
            disabled={readOnly}
            value={config.loopType || 'forEach'}
            onValueChange={(value) => updateConfig({ ...config, loopType: value })}
          >
            <SelectTrigger id="loopType">
              <SelectValue placeholder="Select loop type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="forEach">For Each (iterate over items)</SelectItem>
              <SelectItem value="count">Count (iterate N times)</SelectItem>
              <SelectItem value="while">While (condition is true)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {config.loopType === 'forEach' && (
          <div className="space-y-2">
            <Label htmlFor="collectionField">Collection Field</Label>
            <Input
              id="collectionField"
              disabled={readOnly}
              value={config.collectionField || ''}
              onChange={(e) => updateConfig({ ...config, collectionField: e.target.value })}
              placeholder="data"
            />
            <p className="text-xs text-gray-500">
              Field containing the array to iterate over
            </p>
          </div>
        )}
        
        {config.loopType === 'count' && (
          <div className="space-y-2">
            <Label htmlFor="count">Count</Label>
            <Input
              id="count"
              disabled={readOnly}
              type="number"
              value={config.count || ''}
              onChange={(e) => updateConfig({ ...config, count: e.target.value })}
              placeholder="10"
            />
            <p className="text-xs text-gray-500">
              Number of iterations
            </p>
          </div>
        )}
        
        {config.loopType === 'while' && (
          <div className="space-y-2">
            <Label>Condition</Label>
            <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
              While condition configuration would go here
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <Label htmlFor="iterationVariable">Iteration Variable Name</Label>
          <Input
            id="iterationVariable"
            disabled={readOnly}
            value={config.iterationVariable || ''}
            onChange={(e) => updateConfig({ ...config, iterationVariable: e.target.value })}
            placeholder="item"
          />
          <p className="text-xs text-gray-500">
            Variable name for the current iteration
          </p>
        </div>
      </div>
    );
  };
  
  const renderMergeNodeConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mergeStrategy">Merge Strategy</Label>
          <Select
            disabled={readOnly}
            value={config.mergeStrategy || 'concat'}
            onValueChange={(value) => updateConfig({ ...config, mergeStrategy: value })}
          >
            <SelectTrigger id="mergeStrategy">
              <SelectValue placeholder="Select merge strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concat">Concatenate</SelectItem>
              <SelectItem value="zip">Zip (pair items)</SelectItem>
              <SelectItem value="merge">Merge (combine objects)</SelectItem>
              <SelectItem value="join">Join (SQL-like join)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
          Additional merge configuration would go here based on the selected strategy
        </div>
      </div>
    );
  };
  
  const renderSpreadsheetGeneratorConfig = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="filename">Output Filename</Label>
          <Input
            id="filename"
            disabled={readOnly}
            value={config.filename || ''}
            onChange={(e) => updateConfig({ ...config, filename: e.target.value })}
            placeholder="generated-spreadsheet.xlsx"
          />
        </div>
        
        <div className="space-y-2">
          <Label>Output Format</Label>
          <Select
            disabled={readOnly}
            value={config.format || 'xlsx'}
            onValueChange={(value) => updateConfig({ ...config, format: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              <SelectItem value="csv">CSV (.csv)</SelectItem>
              <SelectItem value="ods">OpenDocument (.ods)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Sheets</Label>
            <Button
              disabled={readOnly}
              variant="outline"
              size="sm"
              onClick={() => {
                const newSheets = [...(config.sheets || []), {
                  name: `Sheet${(config.sheets?.length || 0) + 1}`,
                  includeHeaders: true
                }];
                updateConfig({ ...config, sheets: newSheets });
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add Sheet
            </Button>
          </div>
          
          {(config.sheets || []).length === 0 ? (
            <div className="text-sm text-gray-500 p-4 text-center border rounded-md">
              No sheets configured. Add a sheet to get started.
            </div>
          ) : (
            <Accordion type="single" collapsible className="border rounded-md">
              {(config.sheets || []).map((sheet, index) => (
                <AccordionItem key={index} value={`sheet-${index}`}>
                  <AccordionTrigger className="px-4">
                    {sheet.name || `Sheet${index + 1}`}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`sheet-name-${index}`}>Sheet Name</Label>
                      <Input
                        id={`sheet-name-${index}`}
                        disabled={readOnly}
                        value={sheet.name || ''}
                        onChange={(e) => {
                          const newSheets = [...(config.sheets || [])];
                          newSheets[index] = { ...sheet, name: e.target.value };
                          updateConfig({ ...config, sheets: newSheets });
                        }}
                        placeholder={`Sheet${index + 1}`}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`sheet-data-${index}`}>Data Source</Label>
                      <Input
                        id={`sheet-data-${index}`}
                        disabled={readOnly}
                        value={sheet.data || ''}
                        onChange={(e) => {
                          const newSheets = [...(config.sheets || [])];
                          newSheets[index] = { ...sheet, data: e.target.value };
                          updateConfig({ ...config, sheets: newSheets });
                        }}
                        placeholder="data"
                      />
                      <p className="text-xs text-gray-500">
                        Enter the input property name (e.g., "data" or "transformedData")
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`include-headers-${index}`}
                        disabled={readOnly}
                        checked={sheet.includeHeaders !== false}
                        onCheckedChange={(checked) => {
                          const newSheets = [...(config.sheets || [])];
                          newSheets[index] = { 
                            ...sheet, 
                            includeHeaders: checked === true 
                          };
                          updateConfig({ ...config, sheets: newSheets });
                        }}
                      />
                      <Label htmlFor={`include-headers-${index}`}>Include Headers</Label>
                    </div>
                    
                    <Button
                      disabled={readOnly}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        const newSheets = [...(config.sheets || [])];
                        newSheets.splice(index, 1);
                        updateConfig({ ...config, sheets: newSheets });
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Remove Sheet
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>
    );
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-gray-50 border-b flex items-center justify-between p-3">
        <h3 className="font-semibold text-gray-900">Node Configuration</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="mx-3 my-2">
          <TabsTrigger value="config" className="flex-1">Configuration</TabsTrigger>
          <TabsTrigger value="info" className="flex-1">Information</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config" className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="node-label">Node Label</Label>
              <Input
                id="node-label"
                value={node?.data?.label || ''}
                disabled={readOnly}
                onChange={(e) => {
                  // This updates the node label directly in the parent component
                  onUpdateConfig({ ...config, label: e.target.value });
                }}
              />
            </div>
            
            <Separator />
            
            {renderNodeConfig()}
          </div>
        </TabsContent>
        
        <TabsContent value="info" className="p-4 overflow-y-auto">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Node Type</h4>
              <p className="text-sm text-gray-600">{node?.data?.type || 'Unknown'}</p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Description</h4>
              <p className="text-sm text-gray-600">
                {getNodeDescription(node?.data?.type)}
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Inputs</h4>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                <li>Data from connected nodes</li>
                {node?.data?.type === 'apiSource' && <li>API endpoint configuration</li>}
                {node?.data?.type === 'formulaNode' && <li>Fields to use in formula</li>}
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Outputs</h4>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                <li>Processed data</li>
                {node?.data?.type === 'dataTransform' && <li>Transformed data structure</li>}
                {node?.data?.type === 'aiAnalyze' && <li>Analysis results and insights</li>}
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Footer with actions */}
      <div className="border-t p-3 flex justify-between items-center bg-gray-50">
        <Button
          variant="outline"
          size="sm"
          onClick={onDuplicate}
          disabled={readOnly}
        >
          <Copy className="h-4 w-4 mr-2" />
          Duplicate
        </Button>
        
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={readOnly}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </div>
    </div>
  );
};

// Helper function to get description for a node type
function getNodeDescription(nodeType?: string): string {
  switch (nodeType) {
    case 'excelInput':
      return 'Imports data from an Excel file.';
    case 'csvInput':
      return 'Imports data from a CSV file.';
    case 'apiSource':
      return 'Fetches data from an external API.';
    case 'userInput':
      return 'Collects data from user input via a form.';
    case 'dataTransform':
      return 'Transforms data using operations like map, filter, sort, etc.';
    case 'dataCleaning':
      return 'Cleans and standardizes data.';
    case 'formulaNode':
      return 'Applies Excel-like formulas to data.';
    case 'filterNode':
      return 'Filters data based on conditions.';
    case 'aiAnalyze':
      return 'Analyzes data using AI to extract insights.';
    case 'aiClassify':
      return 'Classifies data into categories using AI.';
    case 'aiSummarize':
      return 'Generates summaries of data using AI.';
    case 'xeroConnect':
      return 'Integrates with Xero accounting software.';
    case 'salesforceConnect':
      return 'Integrates with Salesforce CRM.';
    case 'googleSheetsConnect':
      return 'Integrates with Google Sheets.';
    case 'excelOutput':
      return 'Exports data to an Excel file.';
    case 'dashboardOutput':
      return 'Creates visualizations and dashboards.';
    case 'emailNotify':
      return 'Sends email notifications with results.';
    case 'conditionalBranch':
      return 'Branches workflow based on conditions.';
    case 'loopNode':
      return 'Iterates over data or repeats operations.';
    case 'mergeNode':
      return 'Combines data from multiple sources.';
    case 'spreadsheetGenerator':
      return 'Creates new spreadsheet files from data.';
    default:
      return 'No description available.';
  }
}

export default NodeConfigPanel;
