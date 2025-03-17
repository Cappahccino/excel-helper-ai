
import { useEffect, useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SchemaColumn } from '@/hooks/useNodeManagement';
import { useWorkflow } from '@/components/workflow/context/WorkflowContext';
import { 
  propagateSchemaDirectly, 
  isNodeReadyForSchemaPropagation,
  getSourceNodeSchema,
  clearSchemaCache
} from '@/utils/schemaPropagation';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Custom hook to manage schema connections between nodes
 */
export function useSchemaConnection(nodeId: string, isSource: boolean = false) {
  const { workflowId, getEdges } = useWorkflow();
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null);
  const [targetNodes, setTargetNodes] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  
  const lastPropagationAttempt = useRef<number>(0);
  const propagationChannel = useRef<any>(null);
  const isInitialized = useRef(false);
  const pendingSchemaUpdates = useRef<Map<string, number>>(new Map());
  
  // Clean up function for subscriptions
  const cleanupSubscriptions = useCallback(() => {
    if (propagationChannel.current) {
      supabase.removeChannel(propagationChannel.current);
      propagationChannel.current = null;
    }
  }, []);
  
  // Find source node if this is a target node
  const findSourceNode = useCallback(async (): Promise<string | null> => {
    if (!workflowId || !nodeId || isSource) return null;
    
    try {
      console.log(`Finding source node for ${nodeId} in workflow ${workflowId}`);
      
      const edges = await getEdges(workflowId);
      const sources = edges
        .filter(edge => edge.target === nodeId)
        .map(edge => edge.source);
      
      if (sources.length === 0) {
        console.log(`No source nodes found for ${nodeId}`);
        setConnectionState('disconnected');
        return null;
      }
      
      if (sources.length > 1) {
        console.warn(`Multiple source nodes found for ${nodeId}, using first one: ${sources[0]}`);
      }
      
      setSourceNodeId(sources[0]);
      setConnectionState('connecting');
      return sources[0];
    } catch (error) {
      console.error('Error finding source node:', error);
      setConnectionState('error');
      setError('Failed to find source node');
      return null;
    }
  }, [workflowId, nodeId, getEdges, isSource]);
  
  // Find target nodes if this is a source node
  const findTargetNodes = useCallback(async (): Promise<string[]> => {
    if (!workflowId || !nodeId || !isSource) return [];
    
    try {
      console.log(`Finding target nodes for ${nodeId} in workflow ${workflowId}`);
      
      const edges = await getEdges(workflowId);
      const targets = edges
        .filter(edge => edge.source === nodeId)
        .map(edge => edge.target);
      
      if (targets.length === 0) {
        console.log(`No target nodes found for ${nodeId}`);
      } else {
        console.log(`Found ${targets.length} target nodes for ${nodeId}: ${targets.join(', ')}`);
        setTargetNodes(targets);
      }
      
      return targets;
    } catch (error) {
      console.error('Error finding target nodes:', error);
      return [];
    }
  }, [workflowId, nodeId, getEdges, isSource]);
  
  // Get schema for this node
  const getSchema = useCallback(async (forceRefresh: boolean = false): Promise<SchemaColumn[] | null> => {
    if (!workflowId) return null;
    
    try {
      setIsLoading(true);
      
      if (isSource) {
        // For source nodes, we fetch schema directly
        console.log(`Getting schema for source node ${nodeId}`);
        
        const sourceSchema = await getSourceNodeSchema(workflowId, nodeId, selectedSheet || undefined);
        
        if (!sourceSchema) {
          setError('Schema not available');
          return null;
        }
        
        const columns = sourceSchema.columns.map((column: string) => ({
          name: column,
          type: sourceSchema.data_types[column] || 'string'
        }));
        
        setSchema(columns);
        setConnectionState('connected');
        return columns;
      } else if (sourceNodeId) {
        // For target nodes, we propagate schema from source
        console.log(`Getting schema from source node ${sourceNodeId} for target node ${nodeId}`);
        
        // Wait for source node to be ready for propagation
        const isSourceReady = await isNodeReadyForSchemaPropagation(workflowId, sourceNodeId);
        
        if (!isSourceReady) {
          console.log(`Source node ${sourceNodeId} not ready for propagation`);
          setConnectionState('connecting');
          
          // Schedule a retry
          const now = Date.now();
          pendingSchemaUpdates.current.set(sourceNodeId, now);
          
          return null;
        }
        
        // Clear cache to ensure fresh schema
        if (forceRefresh) {
          clearSchemaCache({ workflowId, nodeId });
        }
        
        // Add debouncing for propagation
        const now = Date.now();
        const timeSinceLastAttempt = now - lastPropagationAttempt.current;
        
        if (timeSinceLastAttempt < 2000 && !forceRefresh) {
          console.log(`Debouncing schema propagation, last attempt was ${timeSinceLastAttempt}ms ago`);
          return null;
        }
        
        lastPropagationAttempt.current = now;
        
        // Propagate schema directly
        const propagated = await propagateSchemaDirectly(
          workflowId, 
          sourceNodeId, 
          nodeId, 
          selectedSheet || undefined
        );
        
        if (!propagated) {
          console.error(`Failed to propagate schema from ${sourceNodeId} to ${nodeId}`);
          setConnectionState('error');
          setError('Failed to propagate schema from source node');
          
          // Schedule a retry if this wasn't a forced refresh
          if (!forceRefresh) {
            pendingSchemaUpdates.current.set(sourceNodeId, now);
          }
          
          return null;
        }
        
        // Now fetch the propagated schema
        const targetSchema = await getSourceNodeSchema(workflowId, nodeId, selectedSheet || undefined);
        
        if (!targetSchema) {
          setError('Schema not available after propagation');
          return null;
        }
        
        const columns = targetSchema.columns.map((column: string) => ({
          name: column,
          type: targetSchema.data_types[column] || 'string'
        }));
        
        setSchema(columns);
        setConnectionState('connected');
        return columns;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting schema:', error);
      setConnectionState('error');
      setError(`Failed to get schema: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, nodeId, sourceNodeId, isSource, selectedSheet]);
  
  // Propagate schema to all target nodes (for source nodes only)
  const propagateSchema = useCallback(async (): Promise<boolean> => {
    if (!workflowId || !isSource || targetNodes.length === 0) return false;
    
    try {
      console.log(`Propagating schema from ${nodeId} to ${targetNodes.length} target nodes`);
      
      let allSuccessful = true;
      const now = Date.now();
      
      // Debounce propagation attempts
      if (now - lastPropagationAttempt.current < 2000) {
        console.log('Skipping propagation, too soon after last attempt');
        return false;
      }
      
      lastPropagationAttempt.current = now;
      
      for (const targetId of targetNodes) {
        console.log(`Propagating schema to ${targetId}`);
        
        const success = await propagateSchemaDirectly(
          workflowId, 
          nodeId, 
          targetId, 
          selectedSheet || undefined
        );
        
        if (!success) {
          console.error(`Failed to propagate schema to ${targetId}`);
          allSuccessful = false;
        } else {
          console.log(`Successfully propagated schema to ${targetId}`);
        }
      }
      
      return allSuccessful;
    } catch (error) {
      console.error('Error propagating schema:', error);
      return false;
    }
  }, [workflowId, nodeId, targetNodes, isSource, selectedSheet]);
  
  // Initialize connections
  useEffect(() => {
    if (!workflowId || !nodeId || isInitialized.current) return;
    
    console.log(`Initializing schema connection for node ${nodeId}, isSource: ${isSource}`);
    
    if (isSource) {
      findTargetNodes();
    } else {
      findSourceNode();
    }
    
    isInitialized.current = true;
    
    // Process any pending schema updates
    const checkPendingUpdates = () => {
      if (pendingSchemaUpdates.current.size > 0) {
        const now = Date.now();
        
        pendingSchemaUpdates.current.forEach((timestamp, sourceId) => {
          const delay = Math.min(10000, Math.pow(2, pendingSchemaUpdates.current.size) * 500);
          
          if (now - timestamp > delay) {
            console.log(`Processing pending schema update for source ${sourceId}`);
            getSchema(true);
            pendingSchemaUpdates.current.delete(sourceId);
          }
        });
      }
    };
    
    // Check for pending updates every 5 seconds
    const intervalId = setInterval(checkPendingUpdates, 5000);
    
    return () => {
      cleanupSubscriptions();
      isInitialized.current = false;
      clearInterval(intervalId);
    };
  }, [workflowId, nodeId, isSource, findSourceNode, findTargetNodes, cleanupSubscriptions, getSchema]);
  
  // Setup subscriptions for edge changes
  useEffect(() => {
    if (!workflowId || !nodeId) return;
    
    console.log(`Setting up subscription to detect edges changes for node ${nodeId}`);
    
    const handleSchemaChange = async (sourceId: string | null) => {
      console.log(`Schema change detected for node ${nodeId}, sourceId: ${sourceId}`);
      
      if (isSource && !sourceId) {
        // If this is a source node, find new target nodes
        const targets = await findTargetNodes();
        
        if (targets.length > 0) {
          // Propagate schema to new target nodes with a small delay
          setTimeout(() => {
            propagateSchema();
          }, 500);
        }
      } else if (!isSource && sourceId) {
        // If this is a target node, get schema from new source
        setSourceNodeId(sourceId);
        setConnectionState('connecting');
        
        // Get schema with a small delay to allow database to update
        setTimeout(() => {
          getSchema(true);
        }, 800);
      }
    };
    
    const channel = supabase
      .channel(`edge_changes_${nodeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_edges',
          filter: isSource 
            ? `source_node_id=eq.${nodeId}` 
            : `target_node_id=eq.${nodeId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            if (isSource) {
              // New edge with this node as source
              const targetId = payload.new.target_node_id;
              console.log(`New edge created: ${nodeId} -> ${targetId}`);
              setTargetNodes(prev => [...prev, targetId]);
              // Propagate schema to new target with a delay
              setTimeout(() => {
                propagateSchemaDirectly(workflowId, nodeId, targetId, selectedSheet || undefined);
              }, 500);
            } else {
              // New edge with this node as target
              const sourceId = payload.new.source_node_id;
              console.log(`New edge created: ${sourceId} -> ${nodeId}`);
              handleSchemaChange(sourceId);
            }
          } else if (payload.eventType === 'DELETE') {
            if (isSource) {
              // Edge with this node as source was deleted
              const targetId = payload.old.target_node_id;
              console.log(`Edge deleted: ${nodeId} -> ${targetId}`);
              setTargetNodes(prev => prev.filter(id => id !== targetId));
            } else {
              // Edge with this node as target was deleted
              console.log(`Edge deleted: ${payload.old.source_node_id} -> ${nodeId}`);
              setSourceNodeId(null);
              setConnectionState('disconnected');
              setSchema([]);
              clearSchemaCache({ workflowId, nodeId });
            }
          }
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workflowId, nodeId, isSource, findTargetNodes, getSchema, propagateSchema, selectedSheet]);
  
  // Setup subscription for source node schema changes
  useEffect(() => {
    if (!workflowId || !nodeId || isSource || !sourceNodeId) return;
    
    console.log(`Setting up subscription for schema changes from source node ${sourceNodeId}`);
    
    // Clean up any existing subscription
    cleanupSubscriptions();
    
    propagationChannel.current = supabase
      .channel(`schema_changes_${nodeId}_${sourceNodeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workflow_file_schemas',
          filter: `node_id=eq.${sourceNodeId}`
        },
        (payload) => {
          console.log(`Schema change detected for source node ${sourceNodeId}`);
          // Source schema has changed - refresh our schema with a small delay
          setTimeout(() => {
            getSchema(true);
          }, 800);
        }
      )
      .subscribe();
    
    return () => {
      cleanupSubscriptions();
    };
  }, [workflowId, nodeId, sourceNodeId, isSource, getSchema, cleanupSubscriptions]);
  
  // Auto-refresh schema if needed for target nodes
  useEffect(() => {
    if (isSource || !sourceNodeId || connectionState !== 'connecting') return;
    
    // Only check for schema propagation if we're in the connecting state
    console.log(`Checking if source node ${sourceNodeId} is ready for schema propagation`);
    
    const checkSourceReady = async () => {
      const isReady = await isNodeReadyForSchemaPropagation(workflowId, sourceNodeId);
      
      if (isReady) {
        console.log(`Source node ${sourceNodeId} is ready, refreshing schema`);
        getSchema(true);
      } else {
        console.log(`Source node ${sourceNodeId} not ready yet`);
      }
    };
    
    // Check immediately and then every 5 seconds
    checkSourceReady();
    const intervalId = setInterval(checkSourceReady, 5000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [workflowId, sourceNodeId, connectionState, isSource, getSchema]);
  
  // Regularly sync target nodes if this is a source node
  useEffect(() => {
    if (!isSource || targetNodes.length === 0) return;
    
    // Re-sync source to target nodes every 20 seconds
    const intervalId = setInterval(() => {
      propagateSchema();
    }, 20000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isSource, targetNodes, propagateSchema]);
  
  return {
    sourceNodeId,
    targetNodes,
    connectionState,
    schema,
    isLoading,
    error,
    getSchema,
    propagateSchema,
    setSelectedSheet,
    selectedSheet
  };
}
