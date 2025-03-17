
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { FilterIcon, AlertTriangle, Loader2, RefreshCw, Info, Check, X, FileText } from 'lucide-react';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import WorkflowLogPanel from '@/components/workflow/WorkflowLogPanel';
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
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [loadingOperation, setLoadingOperation] = useState<'initial' | 'refresh' | 'manual' | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  const workflow = useWorkflow();

  // Reference to track loading start time
  const loadingStartTime = useRef<number | null>(null);
  // Reference for loading timeout
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Reference for recovery timeout
  const recoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Helper function to clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = null;
    }
  }, []);

  // Enhanced loading state handler with progressive timeouts
  const handleLoadingState = useCallback(() => {
    clearAllTimeouts();
    
    // Set initial timeout (15 seconds) to show warning
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.log(`FilteringNode ${id}: Schema loading taking longer than expected`);
        setLoadingError('Schema loading is taking longer than expected. This may be because the source node is still processing data or there was an error.');
        
        // Set recovery timeout (additional 15 seconds) to force reset loading state
        recoveryTimeoutRef.current = setTimeout(() => {
          if (isLoading) {
            console.log(`FilteringNode ${id}: Schema loading timed out, forcing reset`);
            setIsLoading(false);
            setIsRefreshing(false);
            toast.warning("Schema loading timed out, please try reconnecting the nodes or refresh manually", {
              id: "loading-timeout"
            });
          }
        }, 15000); // Additional 15 seconds (30 seconds total)
      }
    }, 15000); // Initial 15 seconds
    
    // Track loading start time for debugging
    loadingStartTime.current = Date.now();
    
  }, [id, isLoading, clearAllTimeouts]);

  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflow.workflowId || !id) return;
    
    // Don't load schema if already loading (unless force refresh)
    if (isLoading && !forceRefresh) return;
    
    console.log(`FilteringNode ${id}: Loading schema for workflow ${workflow.workflowId} (forceRefresh: ${forceRefresh})`);
    setIsLoading(true);
    setLoadingError(null);
    setLoadingAttempts(prev => prev + 1);
    
    // Set loading operation type based on context
    if (forceRefresh && isRefreshing) {
      setLoadingOperation('refresh');
    } else if (forceRefresh) {
      setLoadingOperation('manual');
    } else {
      setLoadingOperation('initial');
    }
    
    // Setup enhanced loading timeouts
    handleLoadingState();
    
    try {
      // First attempt: try to get schema directly for this node
      let schema = forceRefresh
        ? null
        : await Promise.race([
            getNodeSchema(workflow.workflowId, id, { forceRefresh }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Direct schema fetch timed out')), 5000))
          ]).catch(err => {
            console.log(`Direct schema fetch timed out or failed: ${err.message}`);
            return null;
          });
      
      if (schema && schema.columns && schema.columns.length > 0) {
        console.log(`FilteringNode ${id}: Found schema directly for this node:`, schema);
        const schemaColumns = convertToSchemaColumns(schema);
        setColumns(schemaColumns);
        setSchemaSource('direct');
        updateOperatorsForColumn(data.config.column, schemaColumns);
        validateConfiguration(data.config, schemaColumns);
        setLastRefreshTime(new Date());
        setIsLoading(false);
        setIsRefreshing(false);
        setLoadingOperation(null);
        setIsInitialized(true);
        clearAllTimeouts();
        return;
      }
      
      // Second attempt: find source node and get its schema
      const sourceId = sourceNodeId || await findSourceNode();
      
      if (!sourceId) {
        setLoadingError('No input connection found. Connect a data source to this node.');
        setColumns([]);
        setIsLoading(false);
        setIsRefreshing(false);
        setLoadingOperation(null);
        clearAllTimeouts();
        return;
      }
      
      // Check if source node is ready for schema propagation
      const isSourceReady = await isNodeReadyForSchemaPropagation(workflow.workflowId, sourceId);
      if (!isSourceReady) {
        setLoadingError('Source node is not ready. The connected file may still be processing or has no schema available.');
        setIsLoading(false);
        setIsRefreshing(false);
        setLoadingOperation(null);
        clearAllTimeouts();
        return;
      }
      
      // Try to get the sheet name from the source node
      const sheetName = sourceNodeSheet || await getNodeSelectedSheet(workflow.workflowId, sourceId) || 'Sheet1';
      console.log(`FilteringNode ${id}: Getting schema from source node ${sourceId} for sheet ${sheetName}`);
      
      // Try to refresh the source schema first with multiple retries
      try {
        const refreshedSchema = await retryOperation(
          async () => {
            try {
              const schema = await forceSchemaRefresh(workflow.workflowId, sourceId, sheetName);
              if (!schema || schema.length === 0) {
                throw new Error(`No schema available for source node ${sourceId}`);
              }
              return schema;
            } catch (error) {
              console.error(`Error refreshing schema: ${error.message}`);
              throw error; // Rethrow to trigger retry
            }
          },
          {
            maxRetries: 3,
            delay: 1000,
            onRetry: (err, attempt) => {
              console.log(`Retry ${attempt}/3 refreshing source schema: ${err.message}`);
            }
          }
        ).catch(err => {
          console.log(`All schema refresh attempts failed: ${err.message}`);
          return null;
        });
        
        if (refreshedSchema && refreshedSchema.length > 0) {
          console.log(`FilteringNode ${id}: Retrieved refreshed schema from source node:`, refreshedSchema);
          
          // Try to propagate the schema to this node with retries
          const propagated = await retryOperation(
            () => propagateSchemaDirectly(workflow.workflowId, sourceId, id, sheetName),
            {
              maxRetries: 3,
              delay: 1000,
              onRetry: (err, attempt) => {
                console.log(`Retry ${attempt}/3 propagating schema: ${err.message}`);
              }
            }
          ).catch(err => {
            console.log(`Schema propagation failed after all retries: ${err.message}`);
            return false;
          });
          
          if (propagated) {
            // Fetch our own schema after propagation
            const ownSchema = await getNodeSchema(workflow.workflowId, id, { 
              forceRefresh: true,
              sheetName 
            });
            
            if (ownSchema && ownSchema.columns && ownSchema.columns.length > 0) {
              const schemaColumns = convertToSchemaColumns(ownSchema);
              setColumns(schemaColumns);
              setSchemaSource('propagated');
              updateOperatorsForColumn(data.config.column, schemaColumns);
              validateConfiguration(data.config, schemaColumns);
              setLastRefreshTime(new Date());
              setIsLoading(false);
              setIsRefreshing(false);
              setLoadingOperation(null);
              setIsInitialized(true);
              clearAllTimeouts();
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
          setIsRefreshing(false);
          setLoadingOperation(null);
          setIsInitialized(true);
          clearAllTimeouts();
          return;
        }
      } catch (refreshError) {
        console.error(`Error in schema refresh/propagation flow: ${refreshError.message}`);
        // Continue to fallback approach
      }
      
      // Last attempt: direct schema extraction from source
      setLoadingError('Schema could not be automatically propagated. Click "Manual Refresh" to try again.');
      setIsLoading(false);
      setIsRefreshing(false);
      setLoadingOperation(null);
      clearAllTimeouts();
    } catch (error) {
      console.error(`FilteringNode ${id}: Error loading schema:`, error);
      setLoadingError(`Failed to load schema: ${(error as Error).message || 'Unknown error'}`);
      setIsLoading(false);
      setIsRefreshing(false);
      setLoadingOperation(null);
      clearAllTimeouts();
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
    isRefreshing,
    handleLoadingState,
    clearAllTimeouts
  ]);

  // Enforce loading state timeout if loading gets stuck
  useEffect(() => {
    if (isLoading) {
      // Set a timeout to force clear loading state after 30 seconds
      const forceResetTimeout = setTimeout(() => {
        console.log(`FilteringNode ${id}: Force resetting loading state (safety mechanism)`);
        setIsLoading(false);
        setIsRefreshing(false);
        setLoadingOperation(null);
        // Only show toast if not already showing an error
        if (!loadingError) {
          toast.warning("Schema loading timed out, please try reconnecting the nodes", {
            id: "loading-force-timeout"
          });
        }
      }, 30000); // 30 second timeout (absolute maximum)
      
      return () => clearTimeout(forceResetTimeout);
    }
  }, [isLoading, id, loadingError]);

  // REMOVED: Auto-loading on node selection
  // Only load schema when we have a source node ID and no schema yet (initial connection)
  useEffect(() => {
    if (sourceNodeId && columns.length === 0 && !isInitialized && !isLoading) {
      console.log(`Initial load for node ${id} with source ${sourceNodeId}`);
      loadSchema(false);
    }
  }, [sourceNodeId, columns.length, isInitialized, isLoading, id, loadSchema]);

  useEffect(() => {
    if (workflow.workflowId && id && !sourceNodeId) {
      findSourceNode();
    }
  }, [workflow.workflowId, id, sourceNodeId, findSourceNode]);

  // Clean up all timeouts on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

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
              // Load schema when a new connection is made
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
          // Load schema when source node schema changes
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

  // Manual force schema propagation
  const handleManualPropagation = async () => {
    if (!workflow.workflowId || !sourceNodeId) {
      toast.error("No source node available");
      return;
    }
    
    setIsLoading(true);
    setLoadingOperation('manual');
    toast.info("Manually propagating schema from source node...");
    
    try {
      // Setup loading timeout for manual propagation
      handleLoadingState();
      
      const sheet = sourceNodeSheet || await getNodeSelectedSheet(workflow.workflowId, sourceNodeId) || 'Sheet1';
      
      // Force propagate with multiple retries
      const success = await retryOperation(
        () => propagateSchemaDirectly(workflow.workflowId, sourceNodeId, id, sheet),
        {
          maxRetries: 3,
          delay: 1000,
          onRetry: (err, attempt) => {
            console.log(`Manual retry ${attempt}/3: ${err.message}`);
          }
        }
      );
      
      if (success) {
        toast.success("Schema propagated successfully");
        // Refresh our view of the schema
        loadSchema(true);
      } else {
        toast.error("Failed to propagate schema");
        setIsLoading(false);
        setLoadingOperation(null);
        clearAllTimeouts();
      }
    } catch (error) {
      console.error("Error in manual propagation:", error);
      toast.error(`Propagation error: ${(error as Error).message}`);
      setIsLoading(false);
      setLoadingOperation(null);
      clearAllTimeouts();
    }
  };

  // Get loading status message based on operation type
  const getLoadingStatusMessage = () => {
    if (!isLoading) return null;
    
    const duration = loadingStartTime.current 
      ? Math.floor((Date.now() - loadingStartTime.current) / 1000)
      : 0;
      
    switch(loadingOperation) {
      case 'initial':
        return `Loading schema... (${duration}s)`;
      case 'refresh':
        return `Refreshing schema... (${duration}s)`;
      case 'manual':
        return `Manually propagating schema... (${duration}s)`;
      default:
        return `Loading... (${duration}s)`;
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{getLoadingStatusMessage()}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        {isLoading && loadingAttempts > 1 && (
          <div className="text-xs text-blue-600">
            {getLoadingStatusMessage()}
          </div>
        )}
        
        {loadingError && (
          <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-800 border border-amber-200">
            <div className="flex">
              <AlertTriangle className="h-4 w-4 text-amber-500 mr-1 flex-shrink-0" />
              <div>
                <p>{loadingError}</p>
                {loadingAttempts > 1 && (
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="p-0 h-auto text-xs text-amber-600"
                    onClick={handleManualPropagation}
                    disabled={isLoading}
                  >
                    Manual Refresh
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
          trigger={null}
        />
      )}
    </Card>
  );
};

export default FilteringNode;
