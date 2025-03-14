
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { FilterIcon, AlertTriangle, Loader2, RefreshCw, Info, Check, X } from 'lucide-react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  getNodeSchema, 
  convertToSchemaColumns,
  getNodeSelectedSheet
} from '@/utils/fileSchemaUtils';
import { 
  forceSchemaRefresh, 
  propagateSchemaDirectly,
  isNodeReadyForSchemaPropagation
} from '@/utils/schemaPropagation';
import { retryOperation, withTimeout } from '@/utils/retryUtils';

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingAttempts, setLoadingAttempts] = useState(0);
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  const [sourceNodeSheet, setSourceNodeSheet] = useState<string | null>(null);
  const [schemaSource, setSchemaSource] = useState<'direct' | 'source' | 'propagated' | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState<NodeJS.Timeout | null>(null);
  
  const workflow = useWorkflow();

  // Reference to track loading start time
  const loadingStartTime = React.useRef<number | null>(null);

  const validateConfiguration = useCallback((config: any, schema: SchemaColumn[]) => {
    if (!config || !schema || schema.length === 0) {
      setValidationErrors([]);
      return;
    }
    
    const errors: string[] = [];
    
    if (config.column && !schema.some(col => col.name === config.column)) {
      errors.push(`Column "${config.column}" does not exist in the schema`);
    }
    
    if (config.column && config.operator) {
      const column = schema.find(col => col.name === config.column);
      if (column) {
        const stringOperators = ['contains', 'starts-with', 'ends-with'];
        const numericOperators = ['greater-than', 'less-than'];
        
        if (column.type === 'number' && stringOperators.includes(config.operator)) {
          errors.push(`Operator "${config.operator}" cannot be used with numeric column "${config.column}"`);
        }
        
        if ((column.type === 'string' || column.type === 'text') && numericOperators.includes(config.operator)) {
          errors.push(`Operator "${config.operator}" cannot be used with text column "${config.column}"`);
        }
      }
    }
    
    setValidationErrors(errors);
    
    return errors.length === 0;
  }, []);

  const updateOperatorsForColumn = useCallback((columnName?: string, schemaColumns?: SchemaColumn[]) => {
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
  }, []);

  const findSourceNode = useCallback(async () => {
    if (!workflow.workflowId || !id) return null;
    
    try {
      console.log(`Finding source node for ${id} in workflow ${workflow.workflowId}`);
      const edges = await workflow.getEdges(workflow.workflowId);
      const sources = edges
        .filter(edge => edge.target === id)
        .map(edge => edge.source);
      
      console.log(`Found source nodes: ${sources.join(', ') || 'none'}`);
      
      if (sources.length > 0) {
        setSourceNodeId(sources[0]);
        
        if (workflow.workflowId) {
          const sheet = await getNodeSelectedSheet(workflow.workflowId, sources[0]);
          if (sheet) {
            console.log(`Source node ${sources[0]} has selected sheet: ${sheet}`);
            setSourceNodeSheet(sheet);
          } else {
            console.log(`Source node ${sources[0]} has no selected sheet, using default`);
            setSourceNodeSheet('Sheet1');
          }
        }
        
        return sources[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error finding source node:', error);
      return null;
    }
  }, [workflow, id]);

  // Helper function to retry with timeout
  const timeoutPromise = (ms: number) => {
    return new Promise<never>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(`Operation timed out after ${ms}ms`));
      }, ms);
    });
  };

  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflow.workflowId || !id) return;
    
    console.log(`FilteringNode ${id}: Loading schema for workflow ${workflow.workflowId} (forceRefresh: ${forceRefresh})`);
    setIsLoading(true);
    setLoadingError(null);
    setLoadingAttempts(prev => prev + 1);
    
    // Set a timeout to show error if loading takes too long
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
    }
    
    const newTimeout = setTimeout(() => {
      if (isLoading) {
        setLoadingError('Schema loading is taking longer than expected. This may be because the source node is still processing data or there was an error.');
      }
    }, 10000); // 10 second timeout
    
    setLoadingTimeout(newTimeout);
    loadingStartTime.current = Date.now();
    
    try {
      // First attempt: try to get schema directly for this node
      let schema = forceRefresh
        ? null
        : await Promise.race([
            getNodeSchema(workflow.workflowId, id, { forceRefresh }),
            timeoutPromise(3000)
          ]).catch(err => {
            console.log(`Direct schema fetch timed out or failed: ${err.message}`);
            return null;
          });
      
      if (schema && schema.columns.length > 0) {
        console.log(`FilteringNode ${id}: Found schema directly for this node:`, schema);
        const schemaColumns = convertToSchemaColumns(schema);
        setColumns(schemaColumns);
        setSchemaSource('direct');
        updateOperatorsForColumn(data.config.column, schemaColumns);
        validateConfiguration(data.config, schemaColumns);
        setLastRefreshTime(new Date());
        setIsLoading(false);
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
        return;
      }
      
      // Second attempt: find source node and get its schema
      const sourceId = sourceNodeId || await findSourceNode();
      
      if (!sourceId) {
        setLoadingError('No input connection found. Connect a data source to this node.');
        setColumns([]);
        setIsLoading(false);
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
        return;
      }
      
      // Check if source node is ready for schema propagation
      const isSourceReady = await isNodeReadyForSchemaPropagation(workflow.workflowId, sourceId);
      if (!isSourceReady) {
        setLoadingError('Source node is not ready. The connected file may still be processing or has no schema available.');
        setIsLoading(false);
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
          setLoadingTimeout(null);
        }
        return;
      }
      
      const sheetName = sourceNodeSheet || 'Sheet1';
      console.log(`FilteringNode ${id}: Getting schema from source node ${sourceId} for sheet ${sheetName}`);
      
      // Try to refresh the source schema first
      try {
        const refreshedSchema = await Promise.race([
          forceSchemaRefresh(workflow.workflowId, sourceId, sheetName),
          timeoutPromise(5000)
        ]).catch(err => {
          console.log(`Schema refresh timed out or failed: ${err.message}`);
          return null;
        });
        
        if (refreshedSchema && refreshedSchema.length > 0) {
          console.log(`FilteringNode ${id}: Retrieved refreshed schema from source node:`, refreshedSchema);
          
          // Propagate the schema to this node
          const propagated = await propagateSchemaDirectly(workflow.workflowId, sourceId, id, sheetName);
          
          if (propagated) {
            // Fetch our own schema after propagation
            const ownSchema = await getNodeSchema(workflow.workflowId, id, { 
              forceRefresh: true,
              sheetName 
            });
            
            if (ownSchema && ownSchema.columns.length > 0) {
              const schemaColumns = convertToSchemaColumns(ownSchema);
              setColumns(schemaColumns);
              setSchemaSource('propagated');
              updateOperatorsForColumn(data.config.column, schemaColumns);
              validateConfiguration(data.config, schemaColumns);
              setLastRefreshTime(new Date());
              setIsLoading(false);
              if (loadingTimeout) {
                clearTimeout(loadingTimeout);
                setLoadingTimeout(null);
              }
              return;
            }
          }
          
          // If propagation or fetching own schema failed, use the source schema directly
          setColumns(refreshedSchema);
          setSchemaSource('source');
          updateOperatorsForColumn(data.config.column, refreshedSchema);
          validateConfiguration(data.config, refreshedSchema);
          setLastRefreshTime(new Date());
          setIsLoading(false);
          if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            setLoadingTimeout(null);
          }
          return;
        }
      } catch (refreshError) {
        console.error(`Error refreshing source schema: ${refreshError.message}`);
        // Continue to fallback approach
      }
      
      // Fallback: Try to get source schema with retries
      try {
        const sourceSchema = await retryOperation(
          () => getNodeSchema(workflow.workflowId, sourceId, { 
            forceRefresh: true,
            sheetName 
          }),
          {
            maxRetries: 3,
            delay: 800,
            onRetry: (err, attempt) => {
              console.log(`Retry ${attempt}/3 getting source schema: ${err.message}`);
            },
            timeout: 5000
          }
        );
        
        if (!sourceSchema || sourceSchema.columns.length === 0) {
          // One last attempt: direct schema propagation
          console.log(`FilteringNode ${id}: Attempting direct schema propagation from ${sourceId}`);
          const propagated = await propagateSchemaDirectly(workflow.workflowId, sourceId, id, sheetName);
          
          if (propagated) {
            const propagatedSchema = await getNodeSchema(workflow.workflowId, id, { 
              forceRefresh: true,
              sheetName 
            });
            
            if (propagatedSchema && propagatedSchema.columns.length > 0) {
              const schemaColumns = convertToSchemaColumns(propagatedSchema);
              setColumns(schemaColumns);
              setSchemaSource('propagated');
              updateOperatorsForColumn(data.config.column, schemaColumns);
              validateConfiguration(data.config, schemaColumns);
              setLastRefreshTime(new Date());
              setIsLoading(false);
              if (loadingTimeout) {
                clearTimeout(loadingTimeout);
                setLoadingTimeout(null);
              }
              return;
            }
          }
          
          setLoadingError('No schema available. The connected node might not have loaded its data yet. Try refreshing or check the source node.');
          setIsLoading(false);
          if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            setLoadingTimeout(null);
          }
          return;
        }
        
        const schemaColumns = convertToSchemaColumns(sourceSchema);
        console.log(`FilteringNode ${id}: Retrieved schema from source node:`, schemaColumns);
        setColumns(schemaColumns);
        setSchemaSource('source');
        
        // Try to propagate the schema to this node for future use
        if (!forceRefresh) {
          propagateSchemaDirectly(workflow.workflowId, sourceId, id, sheetName)
            .then(success => {
              if (success) {
                console.log(`Schema propagated from ${sourceId} to ${id}`);
              }
            });
        }
        
        updateOperatorsForColumn(data.config.column, schemaColumns);
        validateConfiguration(data.config, schemaColumns);
        setLastRefreshTime(new Date());
      } catch (error) {
        console.error(`Error getting source schema: ${error.message}`);
        setLoadingError(`Failed to get schema from source node: ${error.message}`);
      }
    } catch (error) {
      console.error(`FilteringNode ${id}: Error loading schema:`, error);
      setLoadingError(`Failed to load schema information: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        setLoadingTimeout(null);
      }
    }
  }, [
    id, 
    workflow, 
    data.config, 
    updateOperatorsForColumn, 
    validateConfiguration, 
    sourceNodeId,
    sourceNodeSheet,
    findSourceNode,
    isLoading,
    loadingTimeout
  ]);

  useEffect(() => {
    if (selected && workflow.workflowId) {
      console.log(`Node ${id} selected, loading schema`);
      loadSchema(false);
    }
  }, [selected, workflow.workflowId, loadSchema]);

  useEffect(() => {
    if (sourceNodeId && columns.length === 0 && !isLoading) {
      loadSchema(false);
    }
  }, [sourceNodeId, columns.length, isLoading, loadSchema]);

  useEffect(() => {
    if (workflow.workflowId && id && !sourceNodeId) {
      findSourceNode();
    }
  }, [workflow.workflowId, id, sourceNodeId, findSourceNode]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
    };
  }, [loadingTimeout]);

  // Set up subscription to detect edge changes
  useEffect(() => {
    if (!workflow.workflowId || !id) return;
    
    console.log(`Setting up subscription to detect edges changes for node ${id}`);
    
    const channel = supabase
      .channel(`edge_changes_${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_edges',
          filter: `target_node_id=eq.${id}`
        },
        (payload) => {
          console.log(`Edge change detected for node ${id}:`, payload);
          
          if (payload.eventType === 'INSERT') {
            const sourceId = payload.new.source_node_id;
            setSourceNodeId(sourceId);
            findSourceNode().then(() => {
              loadSchema(true);
            });
          } else if (payload.eventType === 'DELETE' && payload.old.target_node_id === id) {
            findSourceNode();
          }
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflow.workflowId, id, findSourceNode, loadSchema]);

  // Set up subscription to detect schema changes in source node
  useEffect(() => {
    if (!workflow.workflowId || !sourceNodeId) return;
    
    console.log(`Setting up subscription to detect schema changes for source node ${sourceNodeId}`);
    
    const dbWorkflowId = workflow.workflowId.startsWith('temp-')
      ? workflow.workflowId.substring(5)
      : workflow.workflowId;
    
    const channel = supabase
      .channel(`schema_changes_${sourceNodeId}_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_file_schemas',
          filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${sourceNodeId}`
        },
        (payload) => {
          console.log(`Schema change detected for source node ${sourceNodeId}:`, payload);
          loadSchema(true);
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflow.workflowId, sourceNodeId, id, loadSchema]);

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

  const handleRefreshSchema = () => {
    setIsRefreshing(true);
    toast.info("Refreshing schema...");
    loadSchema(true);
  };

  return (
    <Card className={`min-w-[280px] ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="bg-blue-50 p-3 flex flex-row items-center">
        <FilterIcon className="w-4 h-4 mr-2 text-blue-600" />
        <CardTitle className="text-sm font-medium">{data.label || 'Filter Data'}</CardTitle>
        
        <div className="ml-auto flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0"
                  onClick={handleRefreshSchema}
                  disabled={isLoading || isRefreshing}
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh schema</p>
                {lastRefreshTime && (
                  <p className="text-xs text-gray-500">
                    Last refreshed: {lastRefreshTime.toLocaleTimeString()}
                  </p>
                )}
                {sourceNodeSheet && (
                  <p className="text-xs text-blue-500">
                    Using sheet: {sourceNodeSheet}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {schemaSource && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    {schemaSource === 'direct' && <Check className="w-4 h-4 text-green-500" />}
                    {schemaSource === 'source' && <Info className="w-4 h-4 text-blue-500" />}
                    {schemaSource === 'propagated' && <Info className="w-4 h-4 text-amber-500" />}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {schemaSource === 'direct' && "Using this node's schema"}
                  {schemaSource === 'source' && "Using source node's schema"}
                  {schemaSource === 'propagated' && "Using propagated schema"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {(isLoading || isRefreshing) && (
            <Loader2 className="w-4 h-4 ml-auto animate-spin text-blue-600" />
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {loadingError && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex">
              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1 flex-shrink-0" />
              <div>
                <p>{loadingError}</p>
                {loadingAttempts > 1 && (
                  <p className="text-xs mt-1">
                    Try connecting a data source and refreshing or reopening the workflow.
                  </p>
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
          {columns.length > 0 && (
            <div className="text-xs text-blue-600 mt-1">
              {columns.length} column{columns.length !== 1 ? 's' : ''} available
            </div>
          )}
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
          <div className="flex items-center space-x-2 pt-1">
            <Switch
              id="case-sensitive"
              checked={data.config.isCaseSensitive || false}
              onCheckedChange={(checked) => handleConfigChange('isCaseSensitive', checked)}
            />
            <Label htmlFor="case-sensitive" className="text-xs cursor-pointer">
              Case sensitive
            </Label>
          </div>
        )}
        
        {validationErrors.length > 0 && (
          <div className="bg-red-50 p-2 rounded-md border border-red-100">
            <div className="flex gap-1.5 items-start">
              <X className="h-3.5 w-3.5 text-red-500 mt-0.5" />
              <div className="text-xs text-red-700">
                {validationErrors.map((error, index) => (
                  <p key={index}>{error}</p>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <Handle type="target" position={Position.Top} id="target" />
        <Handle type="source" position={Position.Bottom} id="source" />
      </CardContent>
    </Card>
  );
};

export default FilteringNode;
