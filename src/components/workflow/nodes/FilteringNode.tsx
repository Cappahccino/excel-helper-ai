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
import { 
  getNodeSchema, 
  convertToSchemaColumns,
  getNodeSelectedSheet
} from '@/utils/fileSchemaUtils';
import { 
  forceSchemaRefresh, 
  propagateSchemaDirectly 
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
  
  const workflow = useWorkflow();

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
      
      console.log(`Found source nodes: ${sources.join(', ')}`);
      
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

  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflow.workflowId || !id) return;
    
    console.log(`FilteringNode ${id}: Loading schema for workflow ${workflow.workflowId} (forceRefresh: ${forceRefresh})`);
    setIsLoading(true);
    setLoadingError(null);
    setLoadingAttempts(prev => prev + 1);
    
    try {
      let schema = forceRefresh
        ? null
        : await withTimeout(
            getNodeSchema(workflow.workflowId, id, { forceRefresh }), 
            3000, 
            'Schema retrieval timed out'
          );
      
      if (schema && schema.columns.length > 0) {
        console.log(`FilteringNode ${id}: Found schema directly for this node:`, schema);
        const schemaColumns = convertToSchemaColumns(schema);
        setColumns(schemaColumns);
        setSchemaSource('direct');
        updateOperatorsForColumn(data.config.column, schemaColumns);
        validateConfiguration(data.config, schemaColumns);
        setLastRefreshTime(new Date());
        setIsLoading(false);
        return;
      }
      
      const sourceId = sourceNodeId || await findSourceNode();
      
      if (!sourceId) {
        setLoadingError('No input connection found. Connect a data source to this node.');
        setColumns([]);
        setIsLoading(false);
        return;
      }
      
      const sheetName = sourceNodeSheet || 'Sheet1';
      console.log(`FilteringNode ${id}: Getting schema from source node ${sourceId} for sheet ${sheetName}`);
      
      const refreshedSchema = await forceSchemaRefresh(workflow.workflowId, sourceId, sheetName);
      
      if (refreshedSchema && refreshedSchema.length > 0) {
        console.log(`FilteringNode ${id}: Retrieved refreshed schema from source node:`, refreshedSchema);
        
        const propagated = await propagateSchemaDirectly(workflow.workflowId, sourceId, id, sheetName);
        
        if (propagated) {
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
            return;
          }
        }
        
        setColumns(refreshedSchema);
        setSchemaSource('source');
        updateOperatorsForColumn(data.config.column, refreshedSchema);
        validateConfiguration(data.config, refreshedSchema);
        setLastRefreshTime(new Date());
        setIsLoading(false);
        return;
      }
      
      const sourceSchema = await retryOperation(
        () => getNodeSchema(workflow.workflowId, sourceId, { 
          forceRefresh,
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
            return;
          }
        }
        
        setLoadingError('No schema available from the connected node. Try refreshing or check that your source node has data and a sheet is selected.');
        setIsLoading(false);
        return;
      }
      
      const schemaColumns = convertToSchemaColumns(sourceSchema);
      console.log(`FilteringNode ${id}: Retrieved schema from source node:`, schemaColumns);
      setColumns(schemaColumns);
      setSchemaSource('source');
      
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
      console.error(`FilteringNode ${id}: Error loading schema:`, error);
      setLoadingError(`Failed to load schema information: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    id, 
    workflow, 
    data.config, 
    updateOperatorsForColumn, 
    validateConfiguration, 
    sourceNodeId,
    sourceNodeSheet,
    findSourceNode
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
