import { useState, useEffect, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useDataProcessing } from '@/hooks/useDataProcessing';
import { 
  FileSpreadsheet, 
  Filter, 
  SortAsc, 
  Calculator, 
  FormInput, 
  Type, 
  Calendar, 
  LayoutGrid, 
  GitMerge, 
  Copy, 
  Loader2,
  Info
} from 'lucide-react';
import { ProcessingNodeType } from '@/types/workflow';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function getNodeIcon(type: ProcessingNodeType) {
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
}

function getNodeDescription(type: ProcessingNodeType) {
  switch (type) {
    case 'filtering':
      return 'Filter data based on conditions';
    case 'sorting':
      return 'Sort data by specific criteria';
    case 'aggregation':
      return 'Compute sums, averages, counts, etc.';
    case 'formulaCalculation':
      return 'Apply Excel-like formulas';
    case 'textTransformation':
      return 'Apply text operations';
    case 'dataTypeConversion':
      return 'Convert between data types';
    case 'dateFormatting':
      return 'Format date values';
    case 'pivotTable':
      return 'Create pivot tables';
    case 'joinMerge':
      return 'Combine multiple datasets';
    case 'deduplication':
      return 'Remove duplicate entries';
    default:
      return 'Process data';
  }
}

function nodeRequiresConfig(type: ProcessingNodeType) {
  return ['filtering', 'sorting', 'aggregation', 'formulaCalculation', 
    'textTransformation', 'dataTypeConversion', 'dateFormatting', 
    'pivotTable', 'joinMerge', 'deduplication'].includes(type);
}

const getOperatorOptions = (columnType: string) => {
  switch (columnType) {
    case 'string':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'startsWith', label: 'Starts With' },
        { value: 'endsWith', label: 'Ends With' }
      ];
    case 'number':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'greaterThan', label: 'Greater Than' },
        { value: 'lessThan', label: 'Less Than' },
        { value: 'between', label: 'Between' }
      ];
    case 'date':
      return [
        { value: 'equals', label: 'Equals' },
        { value: 'before', label: 'Before' },
        { value: 'after', label: 'After' },
        { value: 'between', label: 'Between' }
      ];
    case 'boolean':
      return [
        { value: 'equals', label: 'Equals' }
      ];
    default:
      return [
        { value: 'equals', label: 'Equals' }
      ];
  }
};

function NodeConfigForm({ type, config, columns, onConfigChange }: { 
  type: ProcessingNodeType, 
  config: any, 
  columns: Array<{ name: string, type: string }>, 
  onConfigChange: (newConfig: any) => void 
}) {
  const [localConfig, setLocalConfig] = useState(config || {});
  
  const handleChange = useCallback((key: string, value: any) => {
    const updatedConfig = { ...localConfig, [key]: value };
    setLocalConfig(updatedConfig);
    onConfigChange(updatedConfig);
  }, [localConfig, onConfigChange]);

  useEffect(() => {
    if (JSON.stringify(config) !== JSON.stringify(localConfig)) {
      setLocalConfig(config || {});
    }
  }, [config]);

  const renderColumnSelect = (fieldName: string, label: string, filterFunc?: (col: { name: string, type: string }) => boolean) => {
    const filteredColumns = filterFunc ? columns.filter(filterFunc) : columns;
    
    return (
      <div>
        <div className="flex items-center gap-1">
          <Label htmlFor={fieldName}>{label}</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Select from columns available in the previous node</p>
                {filteredColumns.length === 0 && (
                  <p className="text-yellow-500 mt-1">No compatible columns found</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select 
          value={localConfig[fieldName] || ''} 
          onValueChange={(value) => handleChange(fieldName, value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select column" />
          </SelectTrigger>
          <SelectContent>
            {filteredColumns.length === 0 ? (
              <div className="px-2 py-1 text-xs text-gray-500">
                No columns available
              </div>
            ) : (
              filteredColumns.map((col) => (
                <SelectItem key={col.name} value={col.name}>
                  {col.name} ({col.type})
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    );
  };

  switch (type) {
    case 'filtering':
      return (
        <div className="space-y-2">
          {renderColumnSelect('column', 'Column')}
          
          {localConfig.column && (
            <>
              <div>
                <Label htmlFor="operator">Operator</Label>
                <Select 
                  value={localConfig.operator || 'equals'} 
                  onValueChange={(value) => handleChange('operator', value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select operator" />
                  </SelectTrigger>
                  <SelectContent>
                    {getOperatorOptions(columns.find(c => c.name === localConfig.column)?.type || 'string').map(op => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="value">Value</Label>
                <Input 
                  id="value" 
                  value={localConfig.value || ''} 
                  onChange={(e) => handleChange('value', e.target.value)} 
                  placeholder="Filter value" 
                />
              </div>
            </>
          )}
        </div>
      );
      
    case 'sorting':
      return (
        <div className="space-y-2">
          {renderColumnSelect('column', 'Column')}
          
          <div>
            <Label htmlFor="order">Sort order</Label>
            <Select 
              value={localConfig.order || 'ascending'} 
              onValueChange={(value) => handleChange('order', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select sort order" />
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
        <div className="space-y-2">
          <div>
            <Label htmlFor="function">Aggregation function</Label>
            <Select 
              value={localConfig.function || 'sum'} 
              onValueChange={(value) => handleChange('function', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select function" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sum">Sum</SelectItem>
                <SelectItem value="avg">Average</SelectItem>
                <SelectItem value="min">Minimum</SelectItem>
                <SelectItem value="max">Maximum</SelectItem>
                <SelectItem value="count">Count</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {renderColumnSelect('column', 'Column', col => col.type === 'number')}
          
          {renderColumnSelect('groupBy', 'Group by (optional)')}
        </div>
      );
      
    case 'textTransformation':
      return (
        <div className="space-y-2">
          {renderColumnSelect('column', 'Text Column', col => col.type === 'string')}
          
          <div>
            <Label htmlFor="transformation">Transformation</Label>
            <Select 
              value={localConfig.transformation || 'uppercase'} 
              onValueChange={(value) => handleChange('transformation', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select transformation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uppercase">Uppercase</SelectItem>
                <SelectItem value="lowercase">Lowercase</SelectItem>
                <SelectItem value="trim">Trim</SelectItem>
                <SelectItem value="replace">Find & Replace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {localConfig.transformation === 'replace' && (
            <>
              <div>
                <Label htmlFor="find">Find</Label>
                <Input 
                  id="find" 
                  value={localConfig.find || ''} 
                  onChange={(e) => handleChange('find', e.target.value)} 
                  placeholder="Text to find" 
                />
              </div>
              <div>
                <Label htmlFor="replace">Replace with</Label>
                <Input 
                  id="replace" 
                  value={localConfig.replace || ''} 
                  onChange={(e) => handleChange('replace', e.target.value)} 
                  placeholder="Replacement text" 
                />
              </div>
            </>
          )}
        </div>
      );
      
    case 'dataTypeConversion':
      return (
        <div className="space-y-2">
          {renderColumnSelect('column', 'Column')}
          
          <div>
            <Label htmlFor="fromType">Current type</Label>
            <Select 
              value={localConfig.fromType || ''} 
              onValueChange={(value) => handleChange('fromType', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select source type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="toType">Convert to</Label>
            <Select 
              value={localConfig.toType || 'string'} 
              onValueChange={(value) => handleChange('toType', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      
    case 'dateFormatting':
      return (
        <div className="space-y-2">
          {renderColumnSelect('column', 'Date Column', col => col.type === 'date')}
          
          <div>
            <Label htmlFor="format">Date Format</Label>
            <Select 
              value={localConfig.format || 'MM/DD/YYYY'} 
              onValueChange={(value) => handleChange('format', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                <SelectItem value="MMM DD, YYYY">MMM DD, YYYY</SelectItem>
                <SelectItem value="DD MMM YYYY">DD MMM YYYY</SelectItem>
                <SelectItem value="MM-DD-YYYY">MM-DD-YYYY</SelectItem>
                <SelectItem value="YYYY/MM/DD">YYYY/MM/DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      
    case 'joinMerge':
      return (
        <div className="space-y-2">
          <div>
            <Label htmlFor="joinType">Join Type</Label>
            <Select 
              value={localConfig.joinType || 'inner'} 
              onValueChange={(value) => handleChange('joinType', value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select join type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inner">Inner Join</SelectItem>
                <SelectItem value="left">Left Join</SelectItem>
                <SelectItem value="right">Right Join</SelectItem>
                <SelectItem value="full">Full Join</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {renderColumnSelect('leftKey', 'Left Key')}
          
          <div>
            <Label htmlFor="rightKey">Right Key</Label>
            <Input 
              id="rightKey" 
              value={localConfig.rightKey || ''} 
              onChange={(e) => handleChange('rightKey', e.target.value)} 
              placeholder="Key from secondary data" 
            />
          </div>
        </div>
      );
      
    case 'deduplication':
      return (
        <div className="space-y-2">
          {renderColumnSelect('columns', 'Columns to Check')}
          
          <div>
            <Label htmlFor="caseSensitive">Case Sensitive</Label>
            <Select 
              value={localConfig.caseSensitive?.toString() || 'true'} 
              onValueChange={(value) => handleChange('caseSensitive', value === 'true')}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Case sensitivity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
      
    default:
      return <div className="text-sm text-gray-500">No configuration needed</div>;
  }
}

export default function DataProcessingNode({ id, data, selected, onConfigChange }: { 
  id: string; 
  data: any; 
  selected: boolean;
  onConfigChange?: (nodeId: string, config: any) => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [availableColumns, setAvailableColumns] = useState<Array<{ name: string, type: string }>>([]);
  const { 
    isProcessing, 
    schema, 
    isLoadingSchema,
    fetchNodeSchema, 
    fetchPreviousNodeSchema 
  } = useDataProcessing();
  
  const needsSecondInput = data.type === 'joinMerge';
  const nodeLabel = data?.label || 'Data Processing';
  const nodeType = data?.type || 'dataProcessing';
  
  useEffect(() => {
    if (schema && schema.length > 0) {
      setAvailableColumns(schema);
    }
  }, [schema]);
  
  useEffect(() => {
    const loadSchemaFromPreviousNode = async () => {
      if (selected && data.workflowId) {
        console.log(`Node ${id} selected, fetching schema from previous node`);
        const prevSchema = await fetchPreviousNodeSchema(data.workflowId, id);
        if (prevSchema && prevSchema.length > 0) {
          setAvailableColumns(prevSchema);
        }
      }
    };
    
    loadSchemaFromPreviousNode();
  }, [selected, id, data.workflowId, fetchPreviousNodeSchema]);
  
  const handleConfigChange = useCallback((newConfig: any) => {
    if (onConfigChange) {
      if (JSON.stringify(data.config) !== JSON.stringify(newConfig)) {
        console.log(`Updating config for node ${id}:`, newConfig);
        onConfigChange(id, newConfig);
      }
    }
  }, [id, data.config, onConfigChange]);

  useEffect(() => {
    if (isProcessing) {
      setProcessing(true);
      const interval = setInterval(() => {
        setProcessingProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 5;
        });
      }, 200);
      
      return () => clearInterval(interval);
    } else {
      setProcessing(false);
      setProcessingProgress(0);
    }
  }, [isProcessing]);

  return (
    <Card className="w-[300px] shadow-md">
      <CardHeader className="bg-blue-50 py-2 flex flex-row items-center">
        <div className="p-1 rounded-md bg-blue-100">
          {getNodeIcon(nodeType)}
        </div>
        <CardTitle className="text-sm font-medium ml-2">{nodeLabel}</CardTitle>
        {isLoadingSchema && (
          <Loader2 className="h-4 w-4 ml-auto animate-spin text-blue-500" />
        )}
        {processing && (
          <Loader2 className="h-4 w-4 ml-auto animate-spin text-blue-500" />
        )}
      </CardHeader>
      
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="text-xs text-gray-600">
            {getNodeDescription(nodeType)}
          </div>
          
          {nodeRequiresConfig(nodeType) && (
            <div className="border rounded p-2 bg-gray-50">
              <div className="font-medium text-xs mb-2">
                <span>Configuration:</span>
              </div>
              
              <NodeConfigForm 
                type={nodeType} 
                config={data.config} 
                columns={availableColumns} 
                onConfigChange={handleConfigChange} 
              />
            </div>
          )}
          
          {isProcessing && (
            <div className="mt-2 flex flex-col space-y-1">
              <div className="flex justify-between items-center">
                <Badge variant="secondary" className="flex items-center text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Processing
                </Badge>
                <span className="text-xs text-gray-500">{processingProgress}%</span>
              </div>
              <Progress value={processingProgress} className="h-1 w-full" />
            </div>
          )}
        </div>
      </CardContent>
      
      <Handle
        type="target"
        position={Position.Top}
        className="w-2 h-2 !bg-blue-500"
      />
      
      {needsSecondInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-2 h-2 !bg-green-500"
          id="secondary"
        />
      )}
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2 h-2 !bg-blue-500"
      />
    </Card>
  );
}
