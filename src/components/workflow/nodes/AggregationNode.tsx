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
      function?: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'median' | 'mode' | 'stddev' | 'variance' | 'first' | 'last';
      column?: string;
      groupBy?: string;
    };
    onChange?: (nodeId: string, config: any) => void;
    workflowId?: string;
  };
  selected?: boolean;
}

const AGGREGATION_FUNCTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'count', label: 'Count' },
  { value: 'median', label: 'Median' },
  { value: 'mode', label: 'Mode' },
  { value: 'stddev', label: 'Standard Deviation' },
  { value: 'variance', label: 'Variance' },
  { value: 'first', label: 'First Value' },
  { value: 'last', label: 'Last Value' }
];

const AggregationNode: React.FC<AggregationNodeProps> = ({ id, data, selected }) => {
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
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

  const loadPreview = useCallback(async () => {
    if (!workflow.workflowId || !id || !data.config.function || !data.config.column) {
      setPreviewData(null);
      return;
    }

    setIsPreviewLoading(true);
    try {
      const edges = await workflow.getEdges(workflow.workflowId);
      const inputNodeIds = edges
        .filter(edge => edge.target === id)
        .map(edge => edge.source);
      
      if (inputNodeIds.length === 0) {
        setPreviewData(null);
        return;
      }

      const sourceNodeId = inputNodeIds[0];
      const response = await fetch('/api/preview-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: workflow.workflowId,
          nodeId: id,
          sourceNodeId,
          config: data.config
        })
      });

      if (!response.ok) {
        throw new Error('Failed to load preview');
      }

      const previewResult = await response.json();
      setPreviewData(previewResult.data);
    } catch (error) {
      console.error('Error loading preview:', error);
      setPreviewData(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [workflow.workflowId, id, data.config]);

  useEffect(() => {
    if (selected) {
      loadSchema();
    }
  }, [loadSchema, selected]);

  useEffect(() => {
    if (selected && data.config.function && data.config.column) {
      loadPreview();
    }
  }, [loadPreview, selected, data.config]);

  const validateConfiguration = (config: any, schema: SchemaColumn[]) => {
    if (!config || !schema || schema.length === 0) {
      setValidationErrors([]);
      return;
    }
    
    const errors: string[] = [];
    
    // For numeric functions, validate that the column is numeric
    if (config.function && config.function !== 'count' && config.column) {
      const column = schema.find(col => col.name === config.column);
      if (column && column.type !== 'number') {
        errors.push(`Function "${config.function}" can only be used with numeric columns.`);
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

  const renderPreview = () => {
    if (!data.config.function || !data.config.column) {
      return null;
    }

    return (
      <div className="mt-3 border-t pt-3">
        <div className="text-xs font-medium text-gray-500 mb-2">Preview</div>
        {isPreviewLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          </div>
        ) : previewData ? (
          <div className="text-xs">
            <div className="grid grid-cols-2 gap-2">
              {data.config.groupBy ? (
                previewData.slice(0, 3).map((row: any, index: number) => (
                  <React.Fragment key={index}>
                    <div className="text-gray-500">{row[data.config.groupBy!]}:</div>
                    <div className="font-medium">{row[data.config.function!].toFixed(2)}</div>
                  </React.Fragment>
                ))
              ) : (
                <>
                  <div className="text-gray-500">Result:</div>
                  <div className="font-medium">
                    {typeof previewData === 'number' ? previewData.toFixed(2) : previewData}
                  </div>
                </>
              )}
            </div>
            {data.config.groupBy && previewData.length > 3 && (
              <div className="mt-1 text-gray-400">
                +{previewData.length - 3} more groups
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-gray-400 py-1">
            No preview available
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className={`min-w-[280px] ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="bg-blue-50 p-3 flex flex-row items-center">
        <Calculator className="w-4 h-4 mr-2 text-blue-600" />
        <CardTitle className="text-sm font-medium">{data.label || 'Aggregate Data'}</CardTitle>
        {(isLoading || schemaLoading[id]) && (
          <Loader2 className="w-4 h-4 ml-auto animate-spin text-blue-600" />
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
          <Label htmlFor="function" className="text-xs">Function</Label>
          <Select
            value={data.config.function || 'sum'}
            onValueChange={(value) => handleConfigChange('function', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select function" />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATION_FUNCTIONS.map((func) => (
                <SelectItem key={func.value} value={func.value}>
                  {func.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="column" className="text-xs">Column</Label>
          <Select
            value={data.config.column || ''}
            onValueChange={(value) => handleConfigChange('column', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {columns.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-500">
                  No columns available
                </div>
              ) : (
                columns.map((column) => (
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
              <SelectValue placeholder="No grouping" />
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

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="mt-2 rounded-md bg-blue-50 p-2 text-xs text-blue-700 border border-blue-100">
                <div className="flex">
                  <span className="font-semibold">Aggregation:</span>
                  <span className="ml-1">
                    {data.config.function 
                      ? `${data.config.function.toUpperCase()} of ${data.config.column || 'column'}`
                      : 'No aggregation configured'}
                    {data.config.groupBy ? ` grouped by ${data.config.groupBy}` : ''}
                  </span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {data.config.function
                ? `Calculates the ${data.config.function} of ${data.config.column || 'selected column'}${data.config.groupBy ? ` for each unique value of ${data.config.groupBy}` : ''}`
                : 'Configure the aggregation to process data'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {renderPreview()}

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </CardContent>
    </Card>
  );
};

export default AggregationNode;
