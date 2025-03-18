
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { FilterIcon, AlertTriangle, Loader2, RefreshCw, Info, Check, X, FileText, Search } from 'lucide-react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import WorkflowLogPanel from '@/components/workflow/WorkflowLogPanel';
import { useSchemaConnection, ConnectionState } from '@/hooks/useSchemaConnection';
import { standardizeColumnType, standardizeSchemaColumns } from '@/utils/schemaStandardization';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

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
    { value: 'not-equals', label: 'After' },
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

const FilteringNode: React.FC<FilteringNodeProps> = ({ id, data, selected }) => {
  const [operators, setOperators] = useState<{ value: string; label: string }[]>(OPERATORS.default);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  const [debug, setDebug] = useState<boolean>(true);
  const [columnSearchTerm, setColumnSearchTerm] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  const workflow = useWorkflow();
  const workflowId = data.workflowId || workflow.workflowId;

  // Enhanced schema connection with better error handling and auto-retries
  const {
    connectionState,
    schema,
    isLoading,
    error,
    lastRefreshTime,
    refreshSchema,
    hasSourceNode
  } = useSchemaConnection(workflowId, id, sourceNodeId, {
    debug: debug,
    autoConnect: true,
    showNotifications: true,
    maxRetries: 3,
    retryDelay: 1000
  });

  const inspectSchemas = useCallback(async () => {
    if (!workflowId || !id) {
      console.log("Cannot inspect schemas: missing workflowId or nodeId");
      return;
    }
    
    try {
      console.log(`Inspecting schemas for workflow ${workflowId}, node ${id}`);
      toast.info('Inspecting schemas...');
      
      const { data, error } = await supabase.functions.invoke('inspectSchemas', {
        body: { workflowId, nodeId: id }
      });
      
      if (error) {
        console.error('Error inspecting schemas:', error);
        toast.error(`Error inspecting schemas: ${error.message}`);
        return;
      }
      
      console.log(`Found ${data.schemaCount} schemas:`, data.schemas);
      
      if (data.schemas.length === 0) {
        if (data.sourceSchemas && data.sourceSchemas.length > 0) {
          toast.info(`No schema for this node, but found ${data.sourceSchemas.length} schemas from source nodes`);
        } else {
          toast.warning('No schemas found for this node');
        }
      } else {
        toast.success(`Found ${data.schemaCount} schemas for this node`);
      }
      
      if (data.hasSourceNode) {
        console.log(`Node has ${data.sourceNodes.length} source nodes:`, data.sourceNodes);
      }
    } catch (error) {
      console.error('Error in inspectSchemas:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [workflowId, id]);

  const findSourceNode = useCallback(async () => {
    if (!workflowId || !id) return null;
    
    try {
      console.log(`FilteringNode ${id}: Finding source node`);
      // Check edges from workflow context first
      const edges = await workflow.getEdges(workflowId);
      const sources = edges
        .filter(edge => edge.target === id)
        .map(edge => edge.source);
      
      if (sources.length > 0) {
        console.log(`FilteringNode ${id}: Found source node ${sources[0]}`);
        setSourceNodeId(sources[0]);
        return sources[0];
      }
      
      // If not found in context, try querying the database directly
      console.log(`FilteringNode ${id}: No source found in workflow context, checking database`);
      const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
      
      const { data: edgesData, error } = await supabase
        .from('workflow_edges')
        .select('source_node_id')
        .eq('workflow_id', dbWorkflowId)
        .eq('target_node_id', id);
        
      if (error) {
        console.error('Error fetching edges from database:', error);
        return null;
      }
      
      if (edgesData && edgesData.length > 0) {
        const source = edgesData[0].source_node_id;
        console.log(`FilteringNode ${id}: Found source node ${source} from database`);
        setSourceNodeId(source);
        return source;
      }
      
      console.log(`FilteringNode ${id}: No source node found`);
      setSourceNodeId(null);
      return null;
    } catch (error) {
      console.error('Error finding source node:', error);
      return null;
    }
  }, [workflow, id, workflowId]);

  // Initialize the component and find source node
  useEffect(() => {
    if (workflowId && id && !isInitialized) {
      findSourceNode().then(() => {
        setIsInitialized(true);
      });
    }
  }, [workflowId, id, findSourceNode, isInitialized]);
  
  // Monitor workflow edge changes to detect source node connections/disconnections
  useEffect(() => {
    if (!workflowId || !id) return;
    
    const channel = supabase
      .channel(`edge-updates-${id}`)
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
          // Refetch source node
          findSourceNode();
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, id, findSourceNode]);

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
        const columnType = standardizeColumnType(column.type);
        const stringOperators = ['contains', 'starts-with', 'ends-with'];
        const numericOperators = ['greater-than', 'less-than'];
        
        if (columnType === 'number' && stringOperators.includes(config.operator)) {
          errors.push(`Operator "${config.operator}" cannot be used with numeric column "${config.column}"`);
        }
        
        if ((columnType === 'string' || columnType === 'text') && numericOperators.includes(config.operator)) {
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
      const standardType = standardizeColumnType(column.type);
      
      switch(standardType) {
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

  const standardizedSchema = useMemo(() => {
    return standardizeSchemaColumns(schema);
  }, [schema]);

  useEffect(() => {
    updateOperatorsForColumn(data.config.column, standardizedSchema);
    validateConfiguration(data.config, standardizedSchema);
  }, [standardizedSchema, data.config.column, updateOperatorsForColumn, validateConfiguration, data.config]);

  const handleConfigChange = (key: string, value: any) => {
    if (data.onChange) {
      const newConfig = { ...data.config, [key]: value };
      data.onChange(id, newConfig);
    }
  };

  const isTextType = (type: string): boolean => {
    const standardType = standardizeColumnType(type);
    return standardType === 'string' || standardType === 'text';
  };

  const selectedColumnType = data.config.column 
    ? standardizedSchema.find(col => col.name === data.config.column)?.type || 'unknown'
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

  const getConnectionStatusInfo = () => {
    switch(connectionState) {
      case ConnectionState.CONNECTED:
        return {
          icon: <Check className="w-4 h-4 text-green-500" />,
          tooltip: "Connected to source schema"
        };
      case ConnectionState.CONNECTING:
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
          tooltip: "Connecting to source schema..."
        };
      case ConnectionState.ERROR:
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
          tooltip: error || "Error connecting to source schema"
        };
      case ConnectionState.DISCONNECTED:
      default:
        return {
          icon: <Info className="w-4 h-4 text-gray-400" />,
          tooltip: hasSourceNode ? "Schema not available" : "No source connected"
        };
    }
  };

  // Filter schema columns based on search term
  const filteredSchema = useMemo(() => {
    if (!columnSearchTerm) return standardizedSchema;
    
    return standardizedSchema.filter(column => 
      column.name.toLowerCase().includes(columnSearchTerm.toLowerCase())
    );
  }, [standardizedSchema, columnSearchTerm]);

  const connectionInfo = getConnectionStatusInfo();

  useEffect(() => {
    if (debug && schema.length > 0) {
      console.log(`FilteringNode ${id} schema:`, schema);
    }
  }, [id, schema, debug]);

  const handleSchemaRefresh = async () => {
    if (sourceNodeId) {
      await refreshSchema();
      toast.info("Refreshing schema...");
    } else {
      toast.info("Connect a source node first");
      // Try to find source node again in case it was connected but not detected
      findSourceNode();
    }
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
                  onClick={handleSchemaRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{sourceNodeId ? "Refresh schema" : "Connect a source first"}</p>
                {lastRefreshTime && (
                  <p className="text-xs text-gray-500">
                    Last refreshed: {lastRefreshTime.toLocaleTimeString()}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0"
                  onClick={inspectSchemas}
                >
                  <Info className="h-3.5 w-3.5 text-gray-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Inspect schemas (debug)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {workflow.executionId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => setShowLogs(!showLogs)}
                  >
                    <FileText className="h-3.5 w-3.5 text-gray-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View node logs</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  {connectionInfo.icon}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{connectionInfo.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {isLoading && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Loading schema...</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {error && sourceNodeId && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex">
              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1 flex-shrink-0" />
              <div>
                <p>{error}</p>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-xs text-amber-600"
                  onClick={handleSchemaRefresh}
                  disabled={isLoading}
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-1.5">
          <Label htmlFor="column" className="text-xs">Column</Label>
          
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <>
              {standardizedSchema.length > 5 && (
                <div className="relative mb-2">
                  <Input
                    placeholder="Search columns..."
                    value={columnSearchTerm}
                    onChange={e => setColumnSearchTerm(e.target.value)}
                    className="h-8 text-xs pl-8"
                    disabled={!sourceNodeId || standardizedSchema.length === 0}
                  />
                  <Search className="w-4 h-4 text-gray-400 absolute left-2 top-2" />
                  {columnSearchTerm && (
                    <X 
                      className="w-4 h-4 text-gray-400 absolute right-2 top-2 cursor-pointer hover:text-gray-600" 
                      onClick={() => setColumnSearchTerm('')}
                    />
                  )}
                </div>
              )}
              
              <Select
                value={data.config.column || ''}
                onValueChange={(value) => handleConfigChange('column', value)}
                disabled={isLoading || standardizedSchema.length === 0 || !sourceNodeId}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={sourceNodeId ? (isLoading ? "Loading..." : "Select column") : "Connect a source first"} />
                </SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  {standardizedSchema.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-500">
                      {sourceNodeId ? "No columns available" : "Connect a source first"}
                    </div>
                  ) : filteredSchema.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-gray-500">
                      No columns match your search
                    </div>
                  ) : (
                    <ScrollArea className="h-full max-h-[220px]">
                      {filteredSchema.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          <div className="flex items-center">
                            {column.name}
                            <Badge variant="outline" className="ml-2 text-[9px] py-0 h-4">
                              {column.type}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </ScrollArea>
                  )}
                </SelectContent>
              </Select>
            </>
          )}
          
          {sourceNodeId ? (
            isLoading ? (
              <div className="text-xs text-blue-600 mt-1 flex items-center">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Loading columns...
              </div>
            ) : standardizedSchema.length > 0 ? (
              <div className="text-xs text-blue-600 mt-1">
                {standardizedSchema.length} column{standardizedSchema.length !== 1 ? 's' : ''} available
                {columnSearchTerm && filteredSchema.length !== standardizedSchema.length && (
                  <span> ({filteredSchema.length} filtered)</span>
                )}
              </div>
            ) : connectionState === ConnectionState.CONNECTED ? (
              <div className="text-xs text-amber-600 mt-1">
                Connected but no columns found
              </div>
            ) : null
          ) : (
            <div className="text-xs text-blue-600 mt-1">
              Connect an input to this node
            </div>
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="operator" className="text-xs">Operator</Label>
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Select
              value={data.config.operator || 'equals'}
              onValueChange={(value) => handleConfigChange('operator', value as any)}
              disabled={!data.config.column || !sourceNodeId}
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
          )}
        </div>
        
        <div className="space-y-1.5">
          <Label htmlFor="value" className="text-xs">Value</Label>
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <Input
              id="value"
              value={data.config.value || ''}
              onChange={(e) => handleConfigChange('value', e.target.value)}
              placeholder={getValuePlaceholder()}
              className="h-8 text-xs"
              type={selectedColumnType === 'number' ? 'number' : 'text'}
              disabled={!data.config.column || !sourceNodeId}
            />
          )}
        </div>
        
        {showCaseSensitiveOption && (
          <div className="flex items-center space-x-2 pt-1">
            {isLoading ? (
              <Skeleton className="h-5 w-10" />
            ) : (
              <>
                <Switch
                  id="case-sensitive"
                  checked={data.config.isCaseSensitive || false}
                  onCheckedChange={(checked) => handleConfigChange('isCaseSensitive', checked)}
                  disabled={!data.config.column || !sourceNodeId}
                />
                <Label htmlFor="case-sensitive" className="text-xs cursor-pointer">
                  Case sensitive
                </Label>
              </>
            )}
          </div>
        )}
        
        {validationErrors.length > 0 && (
          <div className="bg-red-50 p-2 rounded-md border border-red-200 text-xs text-red-600">
            <div className="flex items-start">
              <AlertTriangle className="h-4 w-4 text-red-500 mr-1 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Validation errors:</p>
                <ul className="list-disc pl-4 mt-1 space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        
        {connectionState === ConnectionState.DISCONNECTED && !sourceNodeId && (
          <div className="bg-blue-50 p-2 rounded-md border border-blue-200 text-xs text-blue-600">
            <div className="flex items-start">
              <Info className="h-4 w-4 text-blue-500 mr-1 flex-shrink-0 mt-0.5" />
              <div>
                <p>Connect an input to this node to enable filtering.</p>
                <p className="mt-1">Drag a connection from another node to this node's input handle.</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      
      <Handle type="target" position={Position.Top} id="in" />
      <Handle type="source" position={Position.Bottom} id="out" />
      
      {showLogs && workflow.executionId && (
        <WorkflowLogPanel
          workflowId={workflow.workflowId}
          executionId={workflow.executionId}
          selectedNodeId={id}
          isOpen={showLogs}
          onOpenChange={setShowLogs}
        />
      )}
    </Card>
  );
};

export default FilteringNode;
