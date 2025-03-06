
import React, { useState, useEffect } from 'react';
import { ProcessingNodeType } from '@/types/workflow';
import { 
  Card, 
  CardContent 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Filter, 
  SortAsc, 
  Calculator, 
  FormInput, 
  Type, 
  FileSpreadsheet, 
  Calendar, 
  LayoutGrid, 
  GitMerge, 
  Copy 
} from 'lucide-react';

interface DataProcessingNodeConfigProps {
  nodeId: string;
  config: Record<string, any>;
  type: ProcessingNodeType;
  onConfigChange: (updatedConfig: Record<string, any>) => void;
}

export function DataProcessingNodeConfig({ nodeId, config, type, onConfigChange }: DataProcessingNodeConfigProps) {
  const [activeTab, setActiveTab] = useState<string>('basic');
  const [localConfig, setLocalConfig] = useState<Record<string, any>>(config || {});
  
  useEffect(() => {
    // Initialize with default operation if not set
    if (!localConfig.operation) {
      setLocalConfig({
        ...localConfig,
        operation: getDefaultOperation(type)
      });
    }
  }, [type]);
  
  useEffect(() => {
    // Update local config when props change
    setLocalConfig(config || {});
  }, [config]);
  
  const handleConfigChange = (key: string, value: any) => {
    const updatedConfig = {
      ...localConfig,
      [key]: value
    };
    
    setLocalConfig(updatedConfig);
    onConfigChange(updatedConfig);
  };
  
  const getDefaultOperation = (nodeType: ProcessingNodeType): string => {
    switch (nodeType) {
      case 'filtering':
        return 'filter';
      case 'sorting':
        return 'sort';
      case 'aggregation':
        return 'aggregate';
      case 'formulaCalculation':
        return 'formula';
      case 'textTransformation':
        return 'text';
      case 'dataTypeConversion':
        return 'convert';
      case 'dateFormatting':
        return 'formatDate';
      case 'pivotTable':
        return 'pivot';
      case 'joinMerge':
        return 'join';
      case 'deduplication':
        return 'deduplicate';
      default:
        return 'process';
    }
  };
  
  const getNodeIcon = () => {
    switch (type) {
      case 'filtering':
        return <Filter className="h-4 w-4" />;
      case 'sorting':
        return <SortAsc className="h-4 w-4" />;
      case 'aggregation':
        return <Calculator className="h-4 w-4" />;
      case 'formulaCalculation':
        return <FormInput className="h-4 w-4" />;
      case 'textTransformation':
        return <Type className="h-4 w-4" />;
      case 'dataTypeConversion':
        return <FileSpreadsheet className="h-4 w-4" />;
      case 'dateFormatting':
        return <Calendar className="h-4 w-4" />;
      case 'pivotTable':
        return <LayoutGrid className="h-4 w-4" />;
      case 'joinMerge':
        return <GitMerge className="h-4 w-4" />;
      case 'deduplication':
        return <Copy className="h-4 w-4" />;
      default:
        return <FileSpreadsheet className="h-4 w-4" />;
    }
  };
  
  const renderOperationConfig = () => {
    switch (type) {
      case 'filtering':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="column">Column</Label>
                <Input 
                  id="column" 
                  placeholder="Column to filter"
                  value={localConfig.column || ''}
                  onChange={(e) => handleConfigChange('column', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="operator">Operator</Label>
                <Select 
                  value={localConfig.operator || 'equals'} 
                  onValueChange={(value) => handleConfigChange('operator', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equals">Equals</SelectItem>
                    <SelectItem value="notEquals">Not Equals</SelectItem>
                    <SelectItem value="contains">Contains</SelectItem>
                    <SelectItem value="startsWith">Starts With</SelectItem>
                    <SelectItem value="endsWith">Ends With</SelectItem>
                    <SelectItem value="greaterThan">Greater Than</SelectItem>
                    <SelectItem value="lessThan">Less Than</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="value">Value</Label>
              <Input 
                id="value" 
                placeholder="Value to compare with"
                value={localConfig.value || ''}
                onChange={(e) => handleConfigChange('value', e.target.value)}
              />
            </div>
          </div>
        );
        
      case 'sorting':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="column">Column</Label>
              <Input 
                id="column" 
                placeholder="Column to sort"
                value={localConfig.column || ''}
                onChange={(e) => handleConfigChange('column', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="direction">Direction</Label>
              <Select 
                value={localConfig.direction || 'ascending'} 
                onValueChange={(value) => handleConfigChange('direction', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ascending">Ascending</SelectItem>
                  <SelectItem value="descending">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );
        
      case 'aggregation':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="function">Aggregation Function</Label>
              <Select 
                value={localConfig.function || 'sum'} 
                onValueChange={(value) => handleConfigChange('function', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select function" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">Sum</SelectItem>
                  <SelectItem value="average">Average</SelectItem>
                  <SelectItem value="count">Count</SelectItem>
                  <SelectItem value="min">Minimum</SelectItem>
                  <SelectItem value="max">Maximum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="column">Column</Label>
              <Input 
                id="column" 
                placeholder="Column to aggregate"
                value={localConfig.column || ''}
                onChange={(e) => handleConfigChange('column', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="groupBy">Group By (optional)</Label>
              <Input 
                id="groupBy" 
                placeholder="Column to group by"
                value={localConfig.groupBy || ''}
                onChange={(e) => handleConfigChange('groupBy', e.target.value)}
              />
            </div>
          </div>
        );
        
      case 'formulaCalculation':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="formula">Formula</Label>
              <Input 
                id="formula" 
                placeholder="e.g., A1 + B1 * C1"
                value={localConfig.formula || ''}
                onChange={(e) => handleConfigChange('formula', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="outputColumn">Output Column</Label>
              <Input 
                id="outputColumn" 
                placeholder="Result column name"
                value={localConfig.outputColumn || ''}
                onChange={(e) => handleConfigChange('outputColumn', e.target.value)}
              />
            </div>
          </div>
        );
        
      // Add configurations for other processing types as needed
      default:
        return (
          <div className="flex items-center justify-center p-4 text-muted-foreground">
            Configure the {type} operation
          </div>
        );
    }
  };
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded bg-blue-100">
            {getNodeIcon()}
          </div>
          <div className="font-medium">{type.charAt(0).toUpperCase() + type.slice(1)}</div>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic" className="space-y-4 pt-4">
            <div>
              <Label htmlFor="operation">Operation</Label>
              <Input 
                id="operation" 
                value={localConfig.operation || getDefaultOperation(type)}
                onChange={(e) => handleConfigChange('operation', e.target.value)}
                className="mb-4"
              />
            </div>
            
            <Separator className="my-4" />
            
            {renderOperationConfig()}
          </TabsContent>
          
          <TabsContent value="advanced" className="pt-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="description">Description</Label>
                <Input 
                  id="description" 
                  placeholder="Add a description for this operation"
                  value={localConfig.description || ''}
                  onChange={(e) => handleConfigChange('description', e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="errorHandling">Error Handling</Label>
                <Select 
                  value={localConfig.errorHandling || 'stopExecution'} 
                  onValueChange={(value) => handleConfigChange('errorHandling', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select error handling strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stopExecution">Stop Execution</SelectItem>
                    <SelectItem value="continueExecution">Continue Execution</SelectItem>
                    <SelectItem value="skipRecord">Skip Record</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2 pt-2">
                <Label htmlFor="cacheResults" className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="cacheResults"
                    checked={localConfig.cacheResults || false}
                    onChange={(e) => handleConfigChange('cacheResults', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span>Cache Results</span>
                </Label>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default DataProcessingNodeConfig;
