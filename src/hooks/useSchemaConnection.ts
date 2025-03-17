
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { toast } from 'sonner';
import { getNodeSchema } from '@/utils/fileSchemaUtils';

// Connection states for better tracking
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/**
 * Custom hook to manage schema connections between nodes
 */
export function useSchemaConnection(
  workflowId: string | null,
  nodeId: string,
  sourceNodeId: string | null,
) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [sourceSchema, setSourceSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [sourceSheetName, setSourceSheetName] = useState<string | null>(null);
  
  // Refs for tracking operation state
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingAttemptRef = useRef(0);
  const initialLoadCompletedRef = useRef(false);
  
  // Clean up timeouts
  const clearTimeouts = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  // Load schema with debouncing and timeouts
  const loadSchema = useCallback(async (forceRefresh = false) => {
    if (!workflowId || !nodeId) return;
    
    if (isLoading && !forceRefresh) {
      console.log(`Node ${nodeId}: Schema already loading, skipping redundant load`);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    loadingAttemptRef.current += 1;
    
    // Set a timeout to prevent infinite loading
    clearTimeouts();
    loadingTimeoutRef.current = setTimeout(() => {
      if (isLoading) {
        console.log(`Node ${nodeId}: Schema loading timed out after 15 seconds`);
        setIsLoading(false);
        setError('Loading timed out. Please try refreshing.');
        setConnectionState(ConnectionState.ERROR);
      }
    }, 15000);

    try {
      // First try to get our own schema
      if (!forceRefresh) {
        const ownSchema = await getNodeSchema(workflowId, nodeId, { 
          forceRefresh: false,
          maxCacheAge: 30000 // 30 seconds cache
        });
        
        if (ownSchema && ownSchema.length > 0) {
          console.log(`Node ${nodeId}: Using existing schema (${ownSchema.length} columns)`);
          setSchema(ownSchema);
          setConnectionState(ConnectionState.CONNECTED);
          setLastRefreshTime(new Date());
          setIsLoading(false);
          clearTimeouts();
          return;
        }
      }
      
      // If no source node, mark as disconnected
      if (!sourceNodeId) {
        console.log(`Node ${nodeId}: No source node connected`);
        setConnectionState(ConnectionState.DISCONNECTED);
        setIsLoading(false);
        clearTimeouts();
        return;
      }

      // Try to get source node's schema
      console.log(`Node ${nodeId}: Loading schema from source node ${sourceNodeId}`);
      setConnectionState(ConnectionState.CONNECTING);
      
      let sheet = sourceSheetName;
      if (!sheet) {
        // Try to get the sheet name from the source node
        const { data: sheetData } = await supabase
          .from('workflow_file_schemas')
          .select('sheet_name')
          .eq('workflow_id', workflowId)
          .eq('node_id', sourceNodeId)
          .maybeSingle();
          
        if (sheetData?.sheet_name) {
          sheet = sheetData.sheet_name;
          setSourceSheetName(sheet);
        }
      }
      
      // Now get the actual schema
      const sourceSchema = await getNodeSchema(workflowId, sourceNodeId, { 
        forceRefresh: true,
        sheetName: sheet || undefined 
      });
      
      if (!sourceSchema || sourceSchema.length === 0) {
        console.log(`Node ${nodeId}: Source node has no schema available`);
        setError('Source node has no schema available yet. Wait for file processing to complete.');
        setConnectionState(ConnectionState.ERROR);
        setIsLoading(false);
        clearTimeouts();
        return;
      }
      
      console.log(`Node ${nodeId}: Retrieved schema from source (${sourceSchema.length} columns)`);
      setSourceSchema(sourceSchema);
      
      // Propagate the schema to our node
      const result = await propagateSchema(sourceSchema);
      
      if (result) {
        setSchema(sourceSchema);
        setConnectionState(ConnectionState.CONNECTED);
        setLastRefreshTime(new Date());
        console.log(`Node ${nodeId}: Schema successfully propagated from source`);
      } else {
        setError('Failed to propagate schema from source node');
        setConnectionState(ConnectionState.ERROR);
      }
    } catch (err) {
      console.error(`Node ${nodeId}: Error loading schema:`, err);
      setError(`Failed to load schema: ${(err as Error).message || 'Unknown error'}`);
      setConnectionState(ConnectionState.ERROR);
    } finally {
      setIsLoading(false);
      clearTimeouts();
    }
  }, [workflowId, nodeId, sourceNodeId, isLoading, clearTimeouts, sourceSheetName]);

  // Propagate schema from source to this node
  const propagateSchema = useCallback(async (schemaToPropagate: SchemaColumn[]): Promise<boolean> => {
    if (!workflowId || !nodeId) return false;
    
    try {
      const sheet = sourceSheetName || 'Sheet1';
      
      // Update schema in database
      const columns = schemaToPropagate.map(col => col.name);
      const dataTypes = schemaToPropagate.reduce((acc, col) => {
        acc[col.name] = col.type;
        return acc;
      }, {} as Record<string, string>);
      
      // Default file ID if none is available
      const fileId = '00000000-0000-0000-0000-000000000000';
      
      const { error } = await supabase
        .from('workflow_file_schemas')
        .upsert({
          workflow_id: workflowId,
          node_id: nodeId,
          columns,
          data_types: dataTypes,
          file_id: fileId,
          sheet_name: sheet,
          has_headers: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'workflow_id,node_id,sheet_name'
        });
        
      if (error) {
        console.error(`Node ${nodeId}: Error updating schema in DB:`, error);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error(`Node ${nodeId}: Error propagating schema:`, err);
      return false;
    }
  }, [workflowId, nodeId, sourceSheetName]);

  // Force refresh the schema
  const refreshSchema = useCallback(() => {
    toast.info("Refreshing schema...");
    loadSchema(true);
  }, [loadSchema]);

  // Set up subscriptions to detect schema changes in source node
  useEffect(() => {
    if (!workflowId || !sourceNodeId) return;
    
    console.log(`Node ${nodeId}: Setting up subscription for source node ${sourceNodeId}`);
    
    const dbWorkflowId = workflowId.startsWith('temp-') 
      ? workflowId.substring(5) 
      : workflowId;
    
    const channel = supabase
      .channel(`schema_changes_${sourceNodeId}_${nodeId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'workflow_file_schemas',
          filter: `workflow_id=eq.${dbWorkflowId} AND node_id=eq.${sourceNodeId}`
        },
        (payload) => {
          console.log(`Node ${nodeId}: Schema change detected in source node ${sourceNodeId}`);
          // Don't immediately reload - wait a short time to debounce multiple updates
          setTimeout(() => {
            loadSchema(true);
          }, 1000);
        }
      )
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, nodeId, sourceNodeId, loadSchema]);

  // Initial load when connected to a source
  useEffect(() => {
    if (sourceNodeId && !initialLoadCompletedRef.current && !isLoading) {
      console.log(`Node ${nodeId}: Initial schema load triggered`);
      initialLoadCompletedRef.current = true;
      loadSchema(false);
    }
  }, [sourceNodeId, nodeId, isLoading, loadSchema]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  return {
    connectionState,
    schema,
    sourceSchema,
    isLoading,
    error,
    lastRefreshTime,
    refreshSchema,
    propagateSchema,
    loadSchema,
    sourceSheetName
  };
}
