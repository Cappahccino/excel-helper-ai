
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { FilterIcon, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { useSchemaManagement } from '@/hooks/useSchemaManagement';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface FilteringNodeProps {
  id: string;
  data: {
    label: string;
    config: {
      column?: string;
      operator?: "equals" | "contains" | "not-equals" | "greater-than" | "less-than" | "starts-with" | "ends-with";
      value?: string;
      isCaseSensitive?: boolean;
    };
    onChange?: (nodeId: string, config: any) => void;
    workflowId?: string;
  };
  selected?: boolean;
}

const OPERATORS = {
  string: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts-with', label: 'Starts With' },
    { value: 'ends-with', label: 'Ends With' }
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'greater-than', label: 'Greater Than' },
    { value: 'less-than', label: 'Less Than' }
  ],
  date: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' },
    { value: 'greater-than', label: 'After' },
    { value: 'less-than', label: 'Before' }
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' }
  ],
  default: [
    { value: 'equals', label: 'Equals' },
    { value: 'not-equals', label: 'Not Equals' }
  ]
};

const FilteringNode: React.FC<FilteringNodeProps> = ({ id, data, selected }) => {
  const [columns, setColumns] = useState<SchemaColumn[]>([]);
  const [operators, setOperators] = useState<{ value: string; label: string }[]>(OPERATORS.default);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [wasEverConnected, setWasEverConnected] = useState(false);
  
  const workflow = useWorkflow();
  const { 
    getNodeSchema, 
    validateNodeConfig,
    isLoading: schemaLoading,
    validationErrors: schemaValidationErrors,
    propagateSchema
  } = useSchemaManagement();

  const inputConnectionExists = useCallback(async () => {
    if (!workflow.workflowId || !id) return false;
    
    try {
      const edges = await workflow.getEdges(workflow.workflowId);
      return edges.some(edge => edge.target === id);
    } catch (error) {
      console.error('Error checking input connections:', error);
      return false;
    }
  }, [id, workflow]);
  
  const getSourceNodeId = useCallback(async () => {
    if (!workflow.workflowId || !id) return null;
    
    try {
      const edges = await workflow.getEdges(workflow.workflowId);
      const incomingEdge = edges.find(edge => edge.target === id);
      return incomingEdge ? incomingEdge.source : null;
    } catch (error) {
      console.error('Error getting source node ID:', error);
      return null;
    }
  }, [id, workflow]);

  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflow.workflowId || !id) return;
    
    setIsLoading(true);
    setLoadingError(null);
    
    try {
      console.log(`Loading schema for filtering node ${id}`);
      
      // First check if we have an input connection
      const hasInputConnection = await inputConnectionExists();
      
      if (!hasInputConnection) {
        setLoadingError('No input connection found. Connect a data source to this node.');
        setColumns([]);
        setWasEverConnected(false);
        return;
      }
      
      setWasEverConnected(true);
      
      const sourceNodeId = await getSourceNodeId();
      
      if (!sourceNodeId) {
        setLoadingError('Could not identify source node.');
        return;
      }
      
      console.log(`Found source node ${sourceNodeId}, fetching schema`);
      
      // Try loading directly from DB first through the workflow context
      const fileSchema = await workflow.getFileSchema?.(sourceNodeId);
      
      if (fileSchema && fileSchema.columns && fileSchema.columns.length > 0) {
        console.log(`Found file schema for source node ${sourceNodeId}:`, fileSchema);
        
        // Convert to SchemaColumn format
        const convertedSchema: SchemaColumn[] = fileSchema.columns.map(colName => {
          const colType = fileSchema.types[colName] || 'unknown';
          let normalizedType: 'string' | 'text' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'unknown' = 'unknown';
          
          if (colType.includes('varchar') || colType.includes('text') || colType.includes('char')) {
            normalizedType = 'string';
          } else if (colType.includes('int') || colType.includes('float') || colType.includes('double') || colType.includes('decimal') || colType.includes('numeric')) {
            normalizedType = 'number';
          } else if (colType.includes('bool')) {
            normalizedType = 'boolean';
          } else if (colType.includes('date') || colType.includes('time')) {
            normalizedType = 'date';
          } else if (colType.includes('json') || colType.includes('object')) {
            normalizedType = 'object';
          } else if (colType.includes('array')) {
            normalizedType = 'array';
          }
          
          return {
            name: colName,
            type: normalizedType
          };
        });
        
        setColumns(convertedSchema);
        
        // Try to propagate schema to this node
        if (workflow.workflowId && forceRefresh) {
          console.log(`Attempting to propagate schema from ${sourceNodeId} to ${id}`);
          await workflow.propagateFileSchema(sourceNodeId, id);
        }
        
        // Update operators for column if selected
        updateOperatorsForColumn(data.config.column, convertedSchema);
        
        // Validate configuration
        validateConfiguration(data.config, convertedSchema);
        
        return;
      }
      
      // Fallback to schema management hook
      const schema = await getNodeSchema(workflow.workflowId, sourceNodeId, { 
        forceRefresh: forceRefresh 
      });
      
      console.log(`Retrieved schema from useSchemaManagement for node ${sourceNodeId}:`, schema);
      
      if (!schema || schema.length === 0) {
        setLoadingError('No schema available from the connected node.');
        
        // If this is a retry and we still don't have schema, try force propagation
        if (retryCount > 0 && sourceNodeId) {
          console.log(`Retry ${retryCount}: Force propagating schema from ${sourceNodeId} to ${id}`);
          
          // Try to initiate schema propagation
          if (workflow.propagateFileSchema) {
            const success = await workflow.propagateFileSchema(sourceNodeId, id);
            if (success) {
              toast.success('Schema propagation initiated successfully');
              // Increase retry count for next attempt
              setRetryCount(prev => prev + 1);
            } else {
              setLoadingError('Schema propagation failed. Please try again or check source node configuration.');
            }
          }
        }
        
        return;
      }
      
      setColumns(schema);
      
      // Update operators if a column is selected
      updateOperatorsForColumn(data.config.column, schema);
      
      // Validate the current configuration
      validateConfiguration(data.config, schema);
      
    } catch (error) {
      console.error('Error loading schema for filtering node:', error);
      setLoadingError('Failed to load schema information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [id, workflow, data.config.column, getNodeSchema, retryCount, inputConnectionExists, getSourceNodeId]);

  useEffect(() => {
    if (selected) {
      loadSchema(false);
    }
  }, [loadSchema, selected]);

  // Initiate a retry logic when first mounted with a slight delay
  useEffect(() => {
    if (id && workflow.workflowId) {
      const timer = setTimeout(() => {
        if (!columns || columns.length === 0) {
          console.log(`Initial schema load for node ${id} - automatic retry`);
          setRetryCount(prev => prev + 1);
          loadSchema(true);
        }
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [id, workflow.workflowId, columns, loadSchema]);

  const updateOperatorsForColumn = (columnName?: string, schemaColumns?: SchemaColumn[]) => {
    if (!columnName || !schemaColumns) {
      setOperators(OPERATORS.default);
      return;
    }
    
    const column = schemaColumns.find(col => col.name === columnName);
    
    if (column) {
      switch(column.type) {
        case 'number':
          setOperators(OPERATORS.number);
          break;
        case 'date':
          setOperators(OPERATORS.date);
          break;
        case 'boolean':
          setOperators(OPERATORS.boolean);
          break;
        case 'string':
        case 'text':
          setOperators(OPERATORS.string);
          break;
        default:
          setOperators(OPERATORS.default);
      }
    }
  };
  
  const validateConfiguration = (config: any, schema: SchemaColumn[]) => {
    if (!config || !schema || schema.length === 0) {
      setValidationErrors([]);
      return;
    }
    
    const { isValid, errors } = validateNodeConfig(config, schema);
    
    if (!isValid) {
      setValidationErrors(errors.map(err => err.message));
    } else {
      setValidationErrors([]);
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    if (data.onChange) {
      const newConfig = { ...data.config, [key]: value };
      
      if (key === 'column') {
        updateOperatorsForColumn(value, columns);
      }
      
      validateConfiguration(newConfig, columns);
      
      data.onChange(id, newConfig);
    }
  };
  
  const isTextType = (type: string): boolean => {
    return type === 'string' || type === 'text';
  };

  const selectedColumnType = data.config.column 
    ? columns.find(col => col.name === data.config.column)?.type || 'unknown'
    : 'unknown';

  const showCaseSensitiveOption = isTextType(selectedColumnType);

  const getValuePlaceholder = () => {
    const type = selectedColumnType;
    const operator = data.config.operator;
    
    if (type === 'date') {
      return 'YYYY-MM-DD';
    }
    
    if (type === 'number') {
      return 'Numeric value';
    }
    
    if (type === 'boolean') {
      return 'true or false';
    }
    
    if (operator === 'contains') {
      return 'Text to search for';
    }
    
    if (operator === 'starts-with') {
      return 'Text that starts with...';
    }
    
    if (operator === 'ends-with') {
      return 'Text that ends with...';
    }
    
    return 'Value to match';
  };

  const handleRetrySchemaLoad = async () => {
    setRetryCount(prev => prev + 1);
    loadSchema(true);
  };

  return (
    <Card className={`min-w-[280px] ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="bg-blue-50 p-3 flex flex-row items-center">
        <FilterIcon className="w-4 h-4 mr-2 text-blue-600" />
        <CardTitle className="text-sm font-medium">{data.label || 'Filter Data'}</CardTitle>
        {(isLoading || schemaLoading[id]) && (
          <Loader2 className="w-4 h-4 ml-auto animate-spin text-blue-600" />
        )}
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {loadingError && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex">
              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1 flex-shrink-0" />
              <div>
                <p>{loadingError}</p>
                {wasEverConnected && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="mt-1.5 h-7 text-xs"
                    onClick={handleRetrySchemaLoad}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry Schema Load
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-1.5">
          <Label htmlFor="column" className="text-xs">Column</Label>
          <Select
            value={data.config.column || ''}
            onValueChange={(value) => handleConfigChange('column', value)}
            disabled={isLoading || columns.length === 0}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={columns.length === 0 ? "No columns available" : "Select column"} />
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
          <Label htmlFor="operator" className="text-xs">Operator</Label>
          <Select
            value={data.config.operator || 'equals'}
            onValueChange={(value) => handleConfigChange('operator', value as any)}
            disabled={!data.config.column}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select operator" />
            </SelectTrigger>
            <SelectContent>
              {operators.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="value" className="text-xs">Value</Label>
          <Input
            id="value"
            value={data.config.value || ''}
            onChange={(e) => handleConfigChange('value', e.target.value)}
            placeholder={getValuePlaceholder()}
            className="h-8 text-xs"
            type={selectedColumnType === 'number' ? 'number' : 'text'}
          />
        </div>
        
        {showCaseSensitiveOption && (
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="caseSensitive" className="text-xs">Case Sensitive</Label>
            <Switch
              id="caseSensitive"
              checked={data.config.isCaseSensitive ?? true}
              onCheckedChange={(checked) => handleConfigChange('isCaseSensitive', checked)}
            />
          </div>
        )}
        
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
                  <span className="font-semibold">Filter:</span>
                  <span className="ml-1">
                    {data.config.column 
                      ? `${data.config.column} ${data.config.operator || 'equals'} ${data.config.value || '(empty)'}`
                      : 'No filter configured'}
                  </span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {data.config.column
                ? `Rows where ${data.config.column} ${data.config.operator || 'equals'} "${data.config.value || ''}" will be kept`
                : 'Configure the filter to process data'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </CardContent>
    </Card>
  );
};

export default FilteringNode;
