
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { FilterIcon, AlertTriangle, Loader2, RefreshCw, Info, Check, X, FileText, Search, Activity } from 'lucide-react';
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
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [debug, setDebug] = useState<boolean>(true);
  const [columnSearchTerm, setColumnSearchTerm] = useState<string>('');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [sourceSheetName, setSourceSheetName] = useState<string | undefined>(undefined);
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  
  const workflow = useWorkflow();
  const workflowId = data.workflowId || workflow.workflowId;

  const {
    connectionState,
    schema,
    isLoading,
    error,
    lastRefreshTime,
    refreshSchema,
    forceSchemaPropagation,
    runSchemaDiagnostics,
    hasSourceNode,
    sheetName
  } = useSchemaConnection(workflowId, id, sourceNodeId, {
    debug: debug,
    autoConnect: true,
    showNotifications: true,
    maxRetries: 3,
    retryDelay: 1000,
    sheetName: sourceSheetName
  });

  const inspectSchemas = useCallback(async () => {
    if (!workflowId || !id) {
      console.log("Cannot inspect schemas: missing workflowId or nodeId");
      return;
    }
    
    try {
      console.log(`Inspecting schemas for workflow ${workflowId}, node ${id}, sheetName: ${sourceSheetName || sheetName || 'default'}`);
      toast.info('Inspecting schemas...');
      
      const { data, error } = await supabase.functions.invoke('inspectSchemas', {
        body: { 
          workflowId, 
          nodeId: id,
          sheetName: sourceSheetName || sheetName
        }
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
          console.log('Source schemas:', data.sourceSchemas);
          
          // Try to extract sheet name
          if (data.sourceSchemas[0] && data.sourceSchemas[0].sheet_name) {
            setSourceSheetName(data.sourceSchemas[0].sheet_name);
            console.log(`Setting source sheet name to ${data.sourceSchemas[0].sheet_name}`);
            toast.info(`Found source sheet: ${data.sourceSchemas[0].sheet_name}`);
          }
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
  }, [workflowId, id, sourceSheetName, sheetName]);

  const getSourceNodeMetadata = useCallback(async (sourceId: string) => {
    if (!workflowId || !sourceId) return null;
    
    try {
      const dbWorkflowId = workflowId.startsWith('temp-') ? workflowId.substring(5) : workflowId;
      
      const { data: nodeData, error } = await supabase
        .from('workflow_files')
        .select('metadata')
        .eq('workflow_id', dbWorkflowId)
        .eq('node_id', sourceId)
        .maybeSingle();
        
      if (error) {
        console.error('Error fetching source node metadata:', error);
        return null;
      }
      
      return nodeData?.metadata || null;
    } catch (err) {
      console.error('Error in getSourceNodeMetadata:', err);
      return null;
    }
  }, [workflowId]);

  const findSourceNode = useCallback(async () => {
    if (!workflowId || !id) return null;
    
    try {
      console.log(`FilteringNode ${id}: Finding source node`);
      const edges = await workflow.getEdges(workflowId);
      const sources = edges
        .filter(edge => edge.target === id)
        .map(edge => edge.source);
      
      if (sources.length > 0) {
        console.log(`FilteringNode ${id}: Found source node ${sources[0]}`);
        setSourceNodeId(sources[0]);
        
        // Get the source node's selected sheet
        const metadata = await getSourceNodeMetadata(sources[0]);
        if (metadata) {
          // Safely check if metadata is an object with selected_sheet property
          if (typeof metadata === 'object' && metadata !== null && 'selected_sheet' in metadata) {
            const selectedSheet = (metadata as { selected_sheet?: string }).selected_sheet;
            if (selectedSheet) {
              console.log(`Source node ${sources[0]} has selected sheet: ${selectedSheet}`);
              setSourceSheetName(selectedSheet);
            }
          }
        }
        
        return sources[0];
      }
      
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
        
        // Get the source node's selected sheet
        const metadata = await getSourceNodeMetadata(source);
        if (metadata) {
          // Safely check if metadata is an object with selected_sheet property
          if (typeof metadata === 'object' && metadata !== null && 'selected_sheet' in metadata) {
            const selectedSheet = (metadata as { selected_sheet?: string }).selected_sheet;
            if (selectedSheet) {
              console.log(`Source node ${source} has selected sheet: ${selectedSheet}`);
              setSourceSheetName(selectedSheet);
            }
          }
        }
        
        return source;
      }
      
      console.log(`FilteringNode ${id}: No source node found`);
      setSourceNodeId(null);
      return null;
    } catch (error) {
      console.error('Error finding source node:', error);
      return null;
    }
  }, [workflow, id, workflowId, getSourceNodeMetadata]);

  useEffect(() => {
    let isActive = true;
    
    if (workflowId && id && sourceNodeId && schema.length === 0 && !isLoading) {
      console.log(`FilteringNode ${id}: Source node connected, forcing schema propagation`);
      forceSchemaPropagation().then(success => {
        if (isActive && success) {
          console.log(`FilteringNode ${id}: Initial schema propagation successful`);
        } else if (isActive) {
          console.warn(`FilteringNode ${id}: Initial schema propagation failed`);
        }
      });
    }
    
    return () => {
      isActive = false;
    };
  }, [workflowId, id, sourceNodeId, forceSchemaPropagation, schema.length, isLoading]);

  useEffect(() => {
    let isActive = true;
    
    if (workflowId && id && !isInitialized) {
      console.log(`FilteringNode ${id}: Initializing component...`);
      findSourceNode().then((source) => {
        if (isActive) {
          if (source) {
            console.log(`FilteringNode ${id}: Source node found during initialization: ${source}`);
          } else {
            console.log(`FilteringNode ${id}: No source node found during initialization`);
          }
          setIsInitialized(true);
        }
      });
    }
    
    return () => {
      isActive = false;
    };
  }, [workflowId, id, findSourceNode, isInitialized]);
  
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
          findSourceNode().then(sourceId => {
            if (sourceId) {
              setTimeout(() => forceSchemaPropagation(), 500);
            }
          });
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, id, findSourceNode, forceSchemaPropagation]);

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
    if (!schema || schema.length === 0) {
      return [];
    }
    return standardizeSchemaColumns(schema);
  }, [schema]);

  useEffect(() => {
    if (standardizedSchema.length > 0) {
      updateOperatorsForColumn(data.config.column, standardizedSchema);
      validateConfiguration(data.config, standardizedSchema);
    }
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

  const filteredSchema = useMemo(() => {
    if (!standardizedSchema || standardizedSchema.length === 0) {
      return [];
    }
    
    if (!columnSearchTerm) {
      return standardizedSchema;
    }
    
    const searchTermLower = columnSearchTerm.toLowerCase();
    return standardizedSchema.filter(column => 
      column.name.toLowerCase().includes(searchTermLower)
    );
  }, [standardizedSchema, columnSearchTerm]);

  const connectionInfo = useMemo(() => {
    return getConnectionStatusInfo();
  }, [connectionState, error, hasSourceNode]);

  useEffect(() => {
    if (debug && standardizedSchema.length > 0) {
      console.log(`FilteringNode ${id} schema:`, standardizedSchema);
    }
  }, [id, standardizedSchema, debug]);

  const handleSchemaRefresh = async () => {
    if (sourceNodeId) {
      console.log(`FilteringNode ${id}: Manually refreshing schema...`);
      await refreshSchema();
      toast.info("Refreshing schema...");
    } else {
      toast.info("Connect a source node first");
      findSourceNode();
    }
  };

  const handleForcePropagation = async () => {
    if (sourceNodeId) {
      console.log(`FilteringNode ${id}: Forcing schema propagation...`);
      const success = await forceSchemaPropagation();
      if (success) {
        toast.success("Schema updated successfully");
      } else {
        toast.error("Failed to update schema");
      }
    } else {
      toast.info("Connect a source node first");
      findSourceNode();
    }
  };

  const handleRunDiagnostics = async () => {
    console.log(`FilteringNode ${id}: Running schema diagnostics...`);
    await runSchemaDiagnostics();
  };

  const isInitialLoading = useMemo(() => {
    return (isLoading && !schema.length) || (!isInitialized && hasSourceNode);
  }, [isLoading, schema.length, isInitialized, hasSourceNode]);

  const handleShowDebugInfo = () => {
    const debugInfo = {
      nodeId: id,
      sourceNodeId,
      sourceSheetName,
      sheetName,
      connectionState,
      schemaLength: schema.length,
      hasSourceNode,
      isLoading,
      workflowId
    };
    
    console.log('FilteringNode debug info:', debugInfo);
    toast.info('Debug info printed to console');
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
                <p>{sourceNodeId ? "Refresh schema" : "Connect a source node first"}</p>
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
                  onClick={() => setShowLogs(!showLogs)}
                >
                  <FileText className="h-3.5 w-3.5 text-gray-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Show logs</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  {connectionInfo.icon}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{connectionInfo.tooltip}</p>
                {sheetName && (
                  <p className="text-xs">Using sheet: {sheetName}</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      
      <CardContent className="p-3 space-y-3">
        {showLogs ? (
          <WorkflowLogPanel 
            workflowId={workflowId} 
            executionId={executionId} 
            selectedNodeId={id} 
            isOpen={showLogs} 
            onOpenChange={(open) => setShowLogs(open)} 
          />
        ) : (
          <>
            {validationErrors.length > 0 && (
              <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                <div className="flex items-start mb-1">
                  <AlertTriangle className="w-3 h-3 mr-1 mt-0.5 text-amber-500" />
                  <span className="font-medium">Configuration errors:</span>
                </div>
                <ul className="list-disc list-inside pl-1 space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
            
            {!hasSourceNode ? (
              <div className="text-center py-4">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <Info className="h-8 w-8 text-gray-400" />
                  <p className="text-sm text-gray-500">Connect a source node to see available columns</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={findSourceNode}
                  >
                    Check connections
                  </Button>
                </div>
              </div>
            ) : isInitialLoading ? (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  <span className="text-sm">Loading schema from source...</span>
                </div>
                <Skeleton className="h-[30px] w-full" />
                <Skeleton className="h-[30px] w-full" />
                <Skeleton className="h-[30px] w-full" />
              </div>
            ) : standardizedSchema.length === 0 ? (
              <div className="text-center py-4">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <AlertTriangle className="h-8 w-8 text-amber-500" />
                  <p className="text-sm text-gray-700">No schema available from source</p>
                  <div className="flex flex-row gap-2 mt-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleForcePropagation}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Force update
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleRunDiagnostics}
                    >
                      <Activity className="h-3.5 w-3.5 mr-1" />
                      Diagnose
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search columns..."
                      className="pl-8"
                      value={columnSearchTerm}
                      onChange={(e) => setColumnSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="column">Column</Label>
                    <Select
                      value={data.config.column || ""}
                      onValueChange={(value) => {
                        handleConfigChange('column', value);
                        updateOperatorsForColumn(value, standardizedSchema);
                      }}
                    >
                      <SelectTrigger id="column">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        <ScrollArea className="h-48">
                          {filteredSchema.map((column) => (
                            <SelectItem key={column.name} value={column.name} className="flex items-center">
                              <span>{column.name}</span>
                              <Badge variant="outline" className="ml-2 text-xs">
                                {column.type}
                              </Badge>
                            </SelectItem>
                          ))}
                          {filteredSchema.length === 0 && (
                            <div className="px-2 py-4 text-center text-sm text-gray-500">
                              No columns match your search
                            </div>
                          )}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1">
                    <Label htmlFor="operator">Operator</Label>
                    <Select
                      value={data.config.operator || ""}
                      onValueChange={(value) => handleConfigChange('operator', value)}
                      disabled={!data.config.column}
                    >
                      <SelectTrigger id="operator">
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
                  
                  <div className="space-y-1">
                    <Label htmlFor="value">Value</Label>
                    <Input
                      id="value"
                      placeholder={getValuePlaceholder()}
                      value={data.config.value || ""}
                      onChange={(e) => handleConfigChange('value', e.target.value)}
                      disabled={!data.config.operator}
                    />
                  </div>
                  
                  {showCaseSensitiveOption && (
                    <div className="flex items-center justify-between space-x-2 pt-1">
                      <Label htmlFor="case-sensitive">Case-sensitive</Label>
                      <Switch
                        id="case-sensitive"
                        checked={!!data.config.isCaseSensitive}
                        onCheckedChange={(checked) => handleConfigChange('isCaseSensitive', checked)}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
            
            {debug && (
              <div className="pt-3 border-t border-gray-200">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-xs"
                  onClick={handleShowDebugInfo}
                >
                  Show Debug Info
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
      
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
    </Card>
  );
};

export default FilteringNode;
