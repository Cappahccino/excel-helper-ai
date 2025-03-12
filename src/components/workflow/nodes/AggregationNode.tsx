
import React, { useEffect, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { Calculator, AlertTriangle, Loader2 } from 'lucide-react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { useSchemaManagement } from '@/hooks/useSchemaManagement';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AggregationNodeProps {
  id: string;
  data: {
    label: string;
    config: {
      function?: "sum" | "avg" | "min" | "max" | "count";
      column?: string;
      groupBy?: string;
    };
    onChange?: (nodeId: string, config: any) => void;
    workflowId?: string;
  };
  selected?: boolean;
}

const AGGREGATION_FUNCTIONS = [
  { value: 'sum', label: 'Sum', description: 'Calculate the sum of values' },
  { value: 'avg', label: 'Average', description: 'Calculate the average of values' },
  { value: 'min', label: 'Minimum', description: 'Find the minimum value' },
  { value: 'max', label: 'Maximum', description: 'Find the maximum value' },
  { value: 'count', label: 'Count', description: 'Count the number of rows' }
];

const AggregationNode: React.FC<AggregationNodeProps> = ({ id, data, selected }) => {
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  const workflow = useWorkflow();
  const { 
    getNodeSchema, 
    validateNodeConfig,
    isLoading: schemaLoading
  } = useSchemaManagement();

  const loadSchema = useCallback(async () => {
    if (!workflow.workflowId || !id) return;
    
    setIsLoading(true);
    setLoadingError(null);
    
    try {
      // Find connected input nodes by checking edges
      const edges = await workflow.getEdges(workflow.workflowId);
      const inputNodeIds = edges
        .filter(edge => edge.target === id)
        .map(edge => edge.source);
      
      if (inputNodeIds.length === 0) {
        setLoadingError('No input connection found. Connect a data source to this node.');
        setColumns([]);
        return;
      }
      
      // Use the first connected input node to get schema
      const sourceNodeId = inputNodeIds[0];
      const schema = await getNodeSchema(workflow.workflowId, sourceNodeId);
      
      if (!schema || schema.length === 0) {
        setLoadingError('No schema available from the connected node.');
        return;
      }
      
      setColumns(schema);
      
      // Validate current configuration
      validateConfiguration(data.config, schema);
    } catch (error) {
      console.error('Error loading schema for aggregation node:', error);
      setLoadingError('Failed to load schema information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [id, workflow, data.config, getNodeSchema]);

  useEffect(() => {
    if (selected) {
      loadSchema();
    }
  }, [loadSchema, selected]);
  
  const validateConfiguration = (config: any, schema: SchemaColumn[]) => {
    if (!config || !schema || schema.length === 0) {
      setValidationErrors([]);
      return;
    }
    
    const errors: string[] = [];
    
    if (config.function && ['sum', 'avg', 'min', 'max'].includes(config.function)) {
      if (!config.column) {
        errors.push(`A column must be selected for ${config.function} function`);
      } else {
        const column = schema.find(col => col.name === config.column);
        if (!column) {
          errors.push(`Column "${config.column}" does not exist in the data`);
        } else if (column.type !== 'number') {
          errors.push(`Function "${config.function}" requires a numeric column. "${config.column}" is type "${column.type}"`);
        }
      }
    }
    
    if (config.groupBy) {
      const column = schema.find(col => col.name === config.groupBy);
      if (!column) {
        errors.push(`Column "${config.groupBy}" does not exist in the data`);
      }
    }
    
    setValidationErrors(errors);
  };

  const handleConfigChange = (key: string, value: any) => {
    if (data.onChange) {
      const newConfig = { ...data.config, [key]: value };
      
      // Validate the new configuration
      validateConfiguration(newConfig, columns);
      
      data.onChange(id, newConfig);
    }
  };

  // Filter columns by type based on aggregation function
  const getEligibleColumns = (func?: string) => {
    if (!func || func === 'count') {
      // All columns can be used for count or if no function selected
      return columns;
    }
    
    // For sum, avg, min, max - only numeric columns
    return columns.filter(col => col.type === 'number');
  };

  return (
    <Card className={`min-w-[280px] ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="bg-green-50 p-3 flex flex-row items-center">
        <Calculator className="w-4 h-4 mr-2 text-green-600" />
        <CardTitle className="text-sm font-medium">{data.label || 'Aggregate Data'}</CardTitle>
        {(isLoading || schemaLoading[id]) && (
          <Loader2 className="w-4 h-4 ml-auto animate-spin text-green-600" />
        )}
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {loadingError && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex">
              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1 flex-shrink-0" />
              {loadingError}
            </div>
          </div>
        )}
        
        <div className="space-y-1.5">
          <Label htmlFor="function" className="text-xs">Aggregation Function</Label>
          <Select
            value={data.config.function || ''}
            onValueChange={(value) => handleConfigChange('function', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select function" />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATION_FUNCTIONS.map((func) => (
                <SelectItem key={func.value} value={func.value}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center">
                        {func.label}
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{func.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="column" className="text-xs">
            Column to Aggregate
            {data.config.function && data.config.function !== 'count' && (
              <span className="text-gray-500 ml-1">(numeric only)</span>
            )}
          </Label>
          <Select
            value={data.config.column || ''}
            onValueChange={(value) => handleConfigChange('column', value)}
            disabled={!data.config.function || isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {getEligibleColumns(data.config.function).length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-500">
                  No suitable columns available
                </div>
              ) : (
                getEligibleColumns(data.config.function).map((column) => (
                  <SelectItem key={column.name} value={column.name}>
                    <div className="flex items-center">
                      {column.name}
                      <Badge variant="outline" className="ml-2 text-[9px] py-0 h-4">
                        {column.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="groupBy" className="text-xs">Group By (Optional)</Label>
          <Select
            value={data.config.groupBy || ''}
            onValueChange={(value) => handleConfigChange('groupBy', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No grouping</SelectItem>
              {columns.map((column) => (
                <SelectItem key={column.name} value={column.name}>
                  <div className="flex items-center">
                    {column.name}
                    <Badge variant="outline" className="ml-2 text-[9px] py-0 h-4">
                      {column.type}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {validationErrors.length > 0 && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex items-start">
              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Configuration issues:</p>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 rounded-md bg-green-50 p-2 text-xs text-green-700 border border-green-100">
          <div className="flex flex-col">
            <span className="font-semibold">Aggregation:</span>
            <span className="ml-1">
              {data.config.function && data.config.column
                ? `${data.config.function} of ${data.config.column}`
                : 'No aggregation configured'}
              {data.config.groupBy && ` grouped by ${data.config.groupBy}`}
            </span>
          </div>
        </div>

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </CardContent>
    </Card>
  );
};

export default AggregationNode;
